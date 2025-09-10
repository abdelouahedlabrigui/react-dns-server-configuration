from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import oracledb
import json
import re
from datetime import datetime
import logging
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware

import requests


# Run the following SQL query to check if the sequence exists and in which schema:

# SELECT sequence_name, sequence_owner
# FROM all_sequences
# WHERE sequence_name = 'DNS_TEST_SESSIONS_SEQ';

# If the sequence doesn't exist, you need to create it. Here's the SQL to create a basic sequence:

# CREATE SEQUENCE DNS_TEST_SESSIONS_SEQ
# START WITH 1
# INCREMENT BY 1
# NOCACHE
# NOCYCLE;



# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database configuration

class DNSTestInput(BaseModel):
    dns_ip: str
    host_ip: str
    domain: str
    host1_prefix: str
    host2_prefix: str

class DNSConfigInput(BaseModel):
    dns_ip: str
    dns_interface: str
    dns_username: str
    dns_password: str
    host_ip: str
    host_interface: str
    host_username: str
    host_password: str
    domain: str
    host1_prefix: str
    host2_prefix: str

class NetworkConfigInput(BaseModel):
    dns_ip: str
    domain: str
    interface: str

class TestResult(BaseModel):
    command: str
    returncode: int
    stderr: str
    stdout: str
    success: bool

class DNSTestResults(BaseModel):
    success: bool
    test_results: Dict[str, TestResult]

class DatabaseManager:
    def __init__(self):
        self.connection = None
    
    async def connect(self):
        try:
            
            self.connection = oracledb.connect(
                user="SYS",
                password="oracle",
                dsn="10.42.0.243:1521/FREE",
                mode=oracledb.SYSDBA
            )
            logger.info("Connected to Oracle Database")
            await self.create_tables()
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise
    
    async def disconnect(self):
        if self.connection:
            self.connection.close()
            logger.info("Disconnected from Oracle Database")
    
    async def create_tables(self):
        """Create necessary tables if they don't exist"""
        create_queries = [
            """
            CREATE TABLE IF NOT EXISTS dns_test_sessions (
                session_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                dns_ip VARCHAR2(45),
                host_ip VARCHAR2(45),
                domain VARCHAR2(255),
                host1_prefix VARCHAR2(50),
                host2_prefix VARCHAR2(50),
                test_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                success NUMBER(1) CHECK (success IN (0,1))
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS dns_test_results (
                result_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                session_id NUMBER,
                test_type VARCHAR2(50),
                command_executed CLOB,
                return_code NUMBER,
                stdout_raw CLOB,
                stderr_output CLOB,
                success NUMBER(1) CHECK (success IN (0,1)),
                parsed_summary CLOB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES dns_test_sessions(session_id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS dns_configurations (
                config_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                dns_ip VARCHAR2(45),
                dns_interface VARCHAR2(50),
                host_ip VARCHAR2(45),
                host_interface VARCHAR2(50),
                domain VARCHAR2(255),
                forward_zone CLOB,
                reverse_zone CLOB,
                named_conf_zones CLOB,
                options_config CLOB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
            """
                CREATE SEQUENCE IF NOT EXISTS DNS_TEST_SESSIONS_SEQ
                START WITH 1
                INCREMENT BY 1
                NOCACHE
                NOCYCLE
            """
        ]
        
        cursor = self.connection.cursor()
        for query in create_queries:
            try:
                cursor.execute(query)
                self.connection.commit()
            except Exception as e:
                if "ORA-00955" not in str(e):  # Table already exists error
                    logger.error(f"Error creating table: {e}")
        cursor.close()

# Initialize database manager
db_manager = DatabaseManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await db_manager.connect()
    yield
    # Shutdown
    await db_manager.disconnect()

app = FastAPI(
    title="DNS Configuration and Testing API",
    description="API for DNS server configuration and testing with Oracle Database integration",
    version="1.0.0",
    lifespan=lifespan
)

origins = [
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def parse_dig_output(stdout: str) -> Dict[str, Any]:
    """Parse dig command output and extract meaningful information"""
    parsed_data = {
        "query_time": None,
        "server": None,
        "answer_section": [],
        "status": None,
        "flags": None,
        "message_size": None
    }
    
    lines = stdout.split('\n')
    
    for line in lines:
        line = line.strip()
        
        # Extract query time
        if "Query time:" in line:
            match = re.search(r'Query time: (\d+) msec', line)
            if match:
                parsed_data["query_time"] = int(match.group(1))
        
        # Extract server information
        if "SERVER:" in line:
            match = re.search(r'SERVER: ([^#]+)#(\d+)', line)
            if match:
                parsed_data["server"] = {"ip": match.group(1), "port": match.group(2)}
        
        # Extract status
        if "status:" in line:
            match = re.search(r'status: (\w+)', line)
            if match:
                parsed_data["status"] = match.group(1)
        
        # Extract flags
        if "flags:" in line:
            match = re.search(r'flags: ([^;]+)', line)
            if match:
                parsed_data["flags"] = match.group(1).strip()
        
        # Extract message size
        if "MSG SIZE" in line:
            match = re.search(r'MSG SIZE.*rcvd: (\d+)', line)
            if match:
                parsed_data["message_size"] = int(match.group(1))
        
        # Extract answer section (A records, PTR records)
        if line and not line.startswith(';') and '\t' in line:
            parts = line.split('\t')
            if len(parts) >= 4:
                parsed_data["answer_section"].append({
                    "name": parts[0].rstrip('.'),
                    "ttl": parts[1].strip() if parts[1].strip().isdigit() else None,
                    "class": parts[2].strip(),
                    "type": parts[3].strip(),
                    "value": parts[4].strip() if len(parts) > 4 else None
                })
    
    return parsed_data

def parse_ping_output(stdout: str) -> Dict[str, Any]:
    """Parse ping command output and extract meaningful information"""
    parsed_data = {
        "target_ip": None,
        "packets_transmitted": None,
        "packets_received": None,
        "packet_loss": None,
        "rtt_stats": None,
        "individual_pings": []
    }
    
    lines = stdout.split('\n')
    
    for line in lines:
        line = line.strip()
        
        # Extract target IP from first ping line
        if "PING" in line and "bytes of data" in line:
            match = re.search(r'PING .+ \(([^)]+)\)', line)
            if match:
                parsed_data["target_ip"] = match.group(1)
        
        # Extract individual ping results
        if "bytes from" in line and "time=" in line:
            match = re.search(r'time=([0-9.]+) ms', line)
            if match:
                parsed_data["individual_pings"].append(float(match.group(1)))
        
        # Extract summary statistics
        if "packets transmitted" in line:
            match = re.search(r'(\d+) packets transmitted, (\d+) received, ([0-9.]+)% packet loss', line)
            if match:
                parsed_data["packets_transmitted"] = int(match.group(1))
                parsed_data["packets_received"] = int(match.group(2))
                parsed_data["packet_loss"] = float(match.group(3))
        
        # Extract RTT statistics
        if "rtt min/avg/max/mdev" in line:
            match = re.search(r'= ([0-9.]+)/([0-9.]+)/([0-9.]+)/([0-9.]+) ms', line)
            if match:
                parsed_data["rtt_stats"] = {
                    "min": float(match.group(1)),
                    "avg": float(match.group(2)),
                    "max": float(match.group(3)),
                    "mdev": float(match.group(4))
                }
    
    return parsed_data

def generate_rich_paragraph(test_type: str, test_result: TestResult, parsed_data: Dict) -> str:
    """Generate rich paragraph summaries for test results"""
    
    if test_type.startswith("dig"):
        if test_result.success and parsed_data.get("status") == "NOERROR":
            answers = parsed_data.get("answer_section", [])
            if answers:
                answer = answers[0]
                return (f"DNS query for {test_type.replace('dig_', '')} was successful. "
                       f"The domain '{answer.get('name', 'N/A')}' resolved to IP address "
                       f"{answer.get('value', 'N/A')} with a TTL of {answer.get('ttl', 'N/A')} seconds. "
                       f"Query completed in {parsed_data.get('query_time', 'N/A')} milliseconds "
                       f"from DNS server {parsed_data.get('server', {}).get('ip', 'N/A')}. "
                       f"Response size was {parsed_data.get('message_size', 'N/A')} bytes.")
            else:
                return f"DNS query for {test_type.replace('dig_', '')} completed but no answer records found."
        else:
            return f"DNS query for {test_type.replace('dig_', '')} failed or returned an error status."
    
    elif test_type.startswith("ping"):
        if test_result.success and parsed_data.get("packets_received", 0) > 0:
            rtt_stats = parsed_data.get("rtt_stats", {})
            return (f"Ping test to {test_type.replace('ping_', '')} was successful. "
                   f"Target IP {parsed_data.get('target_ip', 'N/A')} responded to "
                   f"{parsed_data.get('packets_received', 'N/A')} out of "
                   f"{parsed_data.get('packets_transmitted', 'N/A')} packets "
                   f"({parsed_data.get('packet_loss', 'N/A')}% packet loss). "
                   f"Round-trip times: minimum {rtt_stats.get('min', 'N/A')}ms, "
                   f"average {rtt_stats.get('avg', 'N/A')}ms, "
                   f"maximum {rtt_stats.get('max', 'N/A')}ms.")
        else:
            return f"Ping test to {test_type.replace('ping_', '')} failed or experienced significant packet loss."
    
    elif test_type == "reverse_lookup":
        if test_result.success and parsed_data.get("status") == "NOERROR":
            answers = parsed_data.get("answer_section", [])
            if answers:
                answer = answers[0]
                return (f"Reverse DNS lookup was successful. "
                       f"IP address query resolved to PTR record showing "
                       f"the hostname as {answer.get('value', 'N/A')}. "
                       f"Query completed in {parsed_data.get('query_time', 'N/A')} milliseconds.")
            else:
                return "Reverse DNS lookup completed but no PTR records found."
        else:
            return "Reverse DNS lookup failed or returned an error status."
    
    return f"Test {test_type} completed with return code {test_result.returncode}."

async def save_dns_test_results(input_data: DNSTestInput, results: DNSTestResults) -> int:
    """Save DNS test results to Oracle database"""
    cursor = db_manager.connection.cursor()
    
    try:
        logger.info(results)
        # Insert session record
        session_query = """
        INSERT INTO dns_test_sessions 
        (dns_ip, host_ip, domain, host1_prefix, host2_prefix, success)
        VALUES (:dns_ip, :host_ip, :domain, :host1_prefix, :host2_prefix, :success)
        """
        
        cursor.execute(session_query, {
            'dns_ip': input_data.dns_ip,
            'host_ip': input_data.host_ip,
            'domain': input_data.domain,
            'host1_prefix': input_data.host1_prefix,
            'host2_prefix': input_data.host2_prefix,
            'success': 1 if results.success else 0
        })
        
        # Get the session ID
        # cursor.execute("SELECT dns_test_sessions_seq.CURRVAL FROM DUAL")
        cursor.execute("SELECT MAX(session_id) FROM dns_test_sessions")

        session_id = cursor.fetchone()[0]
        
        # Insert individual test results
        for test_type, test_result in results.test_results.items():
            # Parse the output based on test type
            if test_type.startswith(('dig_', 'reverse_lookup')):
                parsed_data = parse_dig_output(test_result.stdout)
            elif test_type.startswith('ping_'):
                parsed_data = parse_ping_output(test_result.stdout)
            else:
                parsed_data = {}
            
            # Generate rich paragraph
            rich_summary = generate_rich_paragraph(test_type, test_result, parsed_data)
            
            result_query = """
            INSERT INTO dns_test_results 
            (session_id, test_type, command_executed, return_code, stdout_raw, 
             stderr_output, success, parsed_summary)
            VALUES (:session_id, :test_type, :command, :return_code, :stdout, 
                    :stderr, :success, :summary)
            """
            
            cursor.execute(result_query, {
                'session_id': session_id,
                'test_type': test_type,
                'command': test_result.command,
                'return_code': test_result.returncode,
                'stdout': test_result.stdout,
                'stderr': test_result.stderr,
                'success': 1 if test_result.success else 0,
                'summary': rich_summary
            })
        
        db_manager.connection.commit()
        return session_id
    
    except Exception as e:
        db_manager.connection.rollback()
        logger.error(f"Error saving DNS test results: {e}")
        raise
    finally:
        cursor.close()

@app.post("/test-dns")
async def test_dns(input_data: DNSTestInput):
    """Test DNS configuration and save results to database"""
    try:
        # Here you would call your existing backend API
        # For now, I'll simulate the response structure based on your document
        
        # Simulate calling the backend API (replace with actual HTTP call)
        import httpx
        async with httpx.AsyncClient() as client:
            try:
                response = requests.post(
                    "http://10.42.0.1:5000/test-dns", json=input_data.dict())
                backend_results = response.json()
                logger.debug(backend_results)
                backend_results = response.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"Backend API error: {e}, Response: {e.response.text}")
                raise HTTPException(status_code=500, detail=f"Backend API error: {e}, Response: {e.response.text}")
            except httpx.RequestError as e:
                logger.error(f"Error connecting to backend API: {e}")
                raise HTTPException(status_code=500, detail=f"Error connecting to backend API: {e}")

        
        # Convert to our model
        test_results = DNSTestResults(**backend_results)
        
        # Save to database
        session_id = await save_dns_test_results(input_data, test_results)
        
        # Generate formatted output with rich paragraphs
        formatted_results = {}
        
        for test_type, test_result in test_results.test_results.items():
            # Parse the output
            if test_type.startswith(('dig_', 'reverse_lookup')):
                parsed_data = parse_dig_output(test_result.stdout)
            elif test_type.startswith('ping_'):
                parsed_data = parse_ping_output(test_result.stdout)
            else:
                parsed_data = {}
            
            # Generate rich paragraph
            rich_summary = generate_rich_paragraph(test_type, test_result, parsed_data)
            
            formatted_results[test_type] = {
                "command": test_result.command,
                "success": test_result.success,
                "return_code": test_result.returncode,
                "rich_summary": rich_summary,
                "parsed_data": parsed_data,
                "raw_stdout": test_result.stdout,
                "stderr": test_result.stderr
            }
        logger.info(json.dumps(formatted_results, indent=4))
        return {
            "success": test_results.success,
            "session_id": session_id,
            "timestamp": datetime.now().isoformat(),
            "test_results": formatted_results,
            "input_parameters": input_data.dict()
        }
        
    except Exception as e:
        logger.error(f"Error in test-dns endpoint: {type(e)}, {e}") # Log the exception type
        raise HTTPException(status_code=500, detail=f"{type(e)}: {e}") # Include the type in the detail 

@app.post("/generate-dns-config")
async def generate_dns_config(input_data: DNSConfigInput):
    """Generate DNS configuration and save to database"""
    try:
        response = requests.post(
            "http://10.42.0.1:5000/generate-dns-config", json=input_data.dict())
        backend_results = response.json()
        logger.debug(backend_results)
        # Save configuration to database
        cursor = db_manager.connection.cursor()
        config_query = """
        INSERT INTO dns_configurations 
        (dns_ip, dns_interface, host_ip, host_interface, domain, 
         forward_zone, reverse_zone, named_conf_zones, options_config)
        VALUES (:dns_ip, :dns_interface, :host_ip, :host_interface, :domain,
                :forward_zone, :reverse_zone, :named_conf_zones, :options_config)
        """
        
        configurations = backend_results.get("configurations", {})
        cursor.execute(config_query, {
            'dns_ip': input_data.dns_ip,
            'dns_interface': input_data.dns_interface,
            'host_ip': input_data.host_ip,
            'host_interface': input_data.host_interface,
            'domain': input_data.domain,
            'forward_zone': configurations.get('forward_zone'),
            'reverse_zone': configurations.get('reverse_zone'),
            'named_conf_zones': configurations.get('named_conf_zones'),
            'options_config': configurations.get('options_config')
        })
        
        db_manager.connection.commit()
        cursor.close()
        
        return backend_results
        
    except Exception as e:
        logger.error(f"Error in generate-dns-config endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/network-config")
async def network_config(input_data: NetworkConfigInput):
    """Configure network settings"""
    try:
        # Call backend API
        # import httpx
        # async with httpx.AsyncClient() as client:
        #     response = await client.post(
        #         "http://10.42.0.1:5000/network-config",
        #         json=input_data.dict()
        #     )
        #     backend_results = response.json()
        response = requests.post(
            "http://10.42.0.1:5000/network-config", json=input_data.dict())
        backend_results = response.json()
        logger.debug(backend_results)
        
        return backend_results
        
    except Exception as e:
        logger.error(f"Error in network-config endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# CREATE TABLE IF NOT EXISTS dns_test_sessions (
#     session_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
#     dns_ip VARCHAR2(45),
#     host_ip VARCHAR2(45),
#     domain VARCHAR2(255),
#     host1_prefix VARCHAR2(50),
#     host2_prefix VARCHAR2(50),
#     test_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
#     success NUMBER(1) CHECK (success IN (0,1))
# )
# """,
# """
# CREATE TABLE IF NOT EXISTS dns_test_results (
#     result_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
#     session_id NUMBER,
#     test_type VARCHAR2(50),
#     command_executed CLOB,
#     return_code NUMBER,
#     stdout_raw CLOB,
#     stderr_output CLOB,
#     success NUMBER(1) CHECK (success IN (0,1)),
#     parsed_summary CLOB,
#     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
#     FOREIGN KEY (session_id) REFERENCES dns_test_sessions(session_id)
# )
# """,
# """
# CREATE TABLE IF NOT EXISTS dns_configurations (
#     config_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
#     dns_ip VARCHAR2(45),
#     dns_interface VARCHAR2(50),
#     host_ip VARCHAR2(45),
#     host_interface VARCHAR2(50),
#     domain VARCHAR2(255),
#     forward_zone CLOB,
#     reverse_zone CLOB,
#     named_conf_zones CLOB,
#     options_config CLOB,
#     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
# )

@app.get("/search-dns-server-config/{dns_interface}")
async def search_dns_server_config(dns_interface: str):
    """Retrieve DNS server configuration by interfaces"""
    cursor = db_manager.connection.cursor()
    
    try:
        query = """
        SELECT 
            * 
        FROM dns_configurations 
        WHERE dns_interface = :dns_interface
        """
        
        cursor.execute(query, {'dns_interface': dns_interface})
        rows = cursor.fetchall()
        
        if not rows:
            raise HTTPException(status_code=404, detail="Session not found")
        
        configs = []
        
        
        for row in rows:
            configs.append({
                "config_id": row[0],
                "dns_ip": row[1],
                "dns_interface": row[2],
                "host_ip": row[3],
                "host_interface": row[4],
                "domain": row[5],
                "forward_zone": row[6].read(),
                "reverse_zone": row[7].read(),
                "named_conf_zones": row[8].read(),
                "options_config": row[9].read(),
                "created_at": row[10]
            })
        
        return configs
        
    finally:
        cursor.close()

@app.get("/test-results/{session_id}")
async def get_test_results(session_id: int):
    """Retrieve test results by session ID"""
    cursor = db_manager.connection.cursor()
    
    try:
        query = """
        SELECT 
            s.dns_ip, s.host_ip, s.domain, s.host1_prefix, s.host2_prefix,
            s.test_timestamp, s.success as session_success,
            r.test_type, r.command_executed, r.return_code, r.stdout_raw,
            r.stderr_output, r.success as test_success, r.parsed_summary
        FROM dns_test_sessions s
        JOIN dns_test_results r ON s.session_id = r.session_id
        WHERE s.session_id = :session_id
        ORDER BY r.result_id
        """
        
        cursor.execute(query, {'session_id': session_id})
        rows = cursor.fetchall()
        
        if not rows:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Format results
        session_info = {
            "session_id": session_id,
            "dns_ip": rows[0][0],
            "host_ip": rows[0][1],
            "domain": rows[0][2],
            "host1_prefix": rows[0][3],
            "host2_prefix": rows[0][4],
            "timestamp": rows[0][5].isoformat(),
            "overall_success": bool(rows[0][6])
        }
        
        test_results = {}
        for row in rows:
            test_type = row[7]
            test_results[test_type] = {
                "command": row[8].read(),
                "return_code": row[9],
                "raw_stdout": row[10].read(),
                "stderr": row[11],
                "success": bool(row[12]),
                "rich_summary": row[13].read()
            }
        
        return {
            "session_info": session_info,
            "test_results": test_results
        }
        
    finally:
        cursor.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="10.42.0.1", port=8000)

