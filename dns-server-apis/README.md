# DNS Configuration and Testing APIs

This repository contains two Python-based APIs for DNS configuration and testing:

-   `app_db.py`: A FastAPI application that integrates with an Oracle database for storing DNS test results and configurations.
-   `app_v1.py`: A Flask application that provides endpoints for generating DNS configurations and testing them using subprocess calls.

## Table of Contents

1.  [app\_db.py - FastAPI with Oracle Database](#app_dbpy---fastapi-with-oracle-database)
    -   [Overview](#overview)
    -   [Features](#features)
    -   [Setup](#setup)
    -   [Endpoints](#endpoints)
    -   [Usage](#usage)
    -   [Database Schema](#database-schema)
2.  [app\_v1.py - Flask API](#app_v1py---flask-api)
    -   [Overview](#overview-1)
    -   [Features](#features-1)
    -   [Setup](#setup-1)
    -   [Endpoints](#endpoints-1)
    -   [Usage](#usage-1)
3.  [Dependencies](#dependencies)
4.  [Contributing](#contributing)
5.  [License](#license)

## app\_db.py - FastAPI with Oracle Database

### Overview

`app_db.py` is a FastAPI application designed to provide a comprehensive interface for DNS configuration and testing. It leverages an Oracle database to persist test results and configuration data, allowing for historical analysis and management.

### Features

-   **DNS Testing**: Executes various DNS tests (dig, ping, reverse lookup) via a backend API and stores the results in an Oracle database.
-   **DNS Configuration Generation**: Generates DNS configuration files (forward zone, reverse zone, named.conf zones, options config) and saves them to the database.
-   **Network Configuration**: Allows configuring network settings via API calls.
-   **Data Persistence**: Uses Oracle database to store test results and DNS configurations.
-   **RESTful API**: Provides a clean and well-documented RESTful API using FastAPI.
-   **CORS Support**: Includes Cross-Origin Resource Sharing (CORS) middleware to allow requests from specified origins (e.g., frontend applications).

### Setup

1.  **Install Dependencies**:

    ```bash
    pip install fastapi uvicorn python-dotenv oracledb requests
    ```

2.  **Configure Oracle Database**:

    -   Ensure you have an Oracle database instance running.
    -   Update the database connection details in `app_db.py` with your Oracle credentials.

        ```python
        # Database configuration
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
        ```

    -   Ensure that the user has `SYSDBA` privileges.
    -   The script will automatically attempt to create the necessary tables upon startup.

3.  **Run the Application**:

    ```bash
    uvicorn app_db:app --host 10.42.0.1 --port 8000 --reload
    ```

    This command starts the FastAPI application, listening on host `10.42.0.1` and port `8000`.  The `--reload` option enables automatic reloading upon code changes.

### Endpoints

-   **POST `/test-dns`**:
    -   Tests DNS configuration and saves results to the database.
    -   **Input**: `DNSTestInput` model.
    -   **Output**: JSON response containing test results, session ID, and timestamp.
-   **POST `/generate-dns-config`**:
    -   Generates DNS configuration and saves it to the database.
    -   **Input**: `DNSConfigInput` model.
    -   **Output**: JSON response containing the generated configurations.
-   **POST `/network-config`**:
    -   Configures network settings.
    -   **Input**: `NetworkConfigInput` model.
    -   **Output**: JSON response from backend API.
-   **GET `/test-results/{session_id}`**:
    -   Retrieves test results by session ID.
    -   **Input**: `session_id` (integer).
    -   **Output**: JSON response containing session information and test results.
-   **GET `/search-dns-server-config/{dns_interface}`**:
    -   Retrieves DNS server configuration by interface.
    -   **Input**: `dns_interface` (string).
    -   **Output**: JSON response containing DNS configurations.

### Usage

Example using `curl` to test the `/test-dns` endpoint:

```bash
curl -X POST -H "Content-Type: application/json" -d '{
    "dns_ip": "10.42.0.243",
    "host_ip": "10.42.0.1",
    "domain": "example.com",
    "host1_prefix": "ns1",
    "host2_prefix": "client1"
}' http://10.42.0.1:8000/test-dns
```

### Database Schema

-   **dns\_test\_sessions**: Stores information about DNS test sessions.

    -   `session_id` (NUMBER): Primary key, auto-generated.
    -   `dns_ip` (VARCHAR2): DNS server IP address.
    -   `host_ip` (VARCHAR2): Host IP address.
    -   `domain` (VARCHAR2): Domain name.
    -   `host1_prefix` (VARCHAR2): Prefix for host 1.
    -   `host2_prefix` (VARCHAR2): Prefix for host 2.
    -   `test_timestamp` (TIMESTAMP): Timestamp of the test.
    -   `success` (NUMBER): Flag indicating if the test was successful (0 or 1).
-   **dns\_test\_results**: Stores detailed results for each test within a session.

    -   `result_id` (NUMBER): Primary key, auto-generated.
    -   `session_id` (NUMBER): Foreign key referencing `dns_test_sessions`.
    -   `test_type` (VARCHAR2): Type of test (e.g., dig, ping).
    -   `command_executed` (CLOB): The command that was executed.
    -   `return_code` (NUMBER): Return code of the command.
    -   `stdout_raw` (CLOB): Raw standard output from the command.
    -   `stderr_output` (CLOB): Standard error output from the command.
    -   `success` (NUMBER): Flag indicating if the test was successful (0 or 1).
    -   `parsed_summary` (CLOB): A summary of the test result.
    -   `created_at` (TIMESTAMP): Timestamp when the result was created.
-   **dns\_configurations**: Stores DNS configuration details.
    -   `config_id` (NUMBER): Primary key, auto-generated.
    -   `dns_ip` (VARCHAR2): DNS server IP address.
    -   `dns_interface` (VARCHAR2): DNS server interface.
    -   `host_ip` (VARCHAR2): Host IP address.
    -   `host_interface` (VARCHAR2): Host interface.
    -   `domain` (VARCHAR2): Domain name.
    -   `forward_zone` (CLOB): Forward zone configuration.
    -   `reverse_zone` (CLOB): Reverse zone configuration.
    -   `named_conf_zones` (CLOB): Named.conf zones configuration.
    -   `options_config` (CLOB): Options configuration.
    -   `created_at` (TIMESTAMP): Timestamp when the configuration was created.

## app\_v1.py - Flask API

### Overview

`app_v1.py` is a Flask application that provides endpoints for generating DNS configurations and testing them.  It uses subprocess calls to execute DNS-related commands.

### Features

-   **DNS Configuration Generation**: Generates DNS configuration files (forward zone, reverse zone, named.conf zones, options config) based on user input.
-   **DNS Testing**: Executes various DNS tests (dig, ping, reverse lookup) using subprocess calls.
-   **Network Configuration**: Allows configuring network settings via API calls.
-   **Health Check**: Provides a health check endpoint.

### Setup

1.  **Install Dependencies**:

    ```bash
    pip install flask flask_cors
    ```

2.  **Run the Application**:

    ```bash
    python app_v1.py
    ```

    This command starts the Flask application.  By default, it runs in debug mode, listening on host `10.42.0.1` and port `5000`.

### Endpoints

-   **POST `/generate-dns-config`**:
    -   Generates DNS configuration files based on user input.
    -   **Input**: JSON payload with DNS configuration parameters.
    -   **Output**: JSON response containing generated configurations and commands.
-   **POST `/test-dns`**:
    -   Executes DNS testing commands.
    -   **Input**: JSON payload with DNS testing parameters.
    -   **Output**: JSON response containing test results.
-   **POST `/network-config`**:
    -   Generates network configuration commands.
    -   **Input**: JSON payload with network configuration parameters.
    -   **Output**: JSON response containing network and firewall commands.
-   **GET `/health`**:
    -   Health check endpoint.
    -   **Output**: JSON response with the service status.

### Usage

Example using `curl` to test the `/test-dns` endpoint:

```bash
curl -X POST -H "Content-Type: application/json" -d '{
    "dns_ip": "10.42.0.243",
    "host_ip": "10.42.0.1",
    "domain": "example.com",
    "host1_prefix": "ns1",
    "host2_prefix": "client1"
}' http://10.42.0.1:5000/test-dns
```

## Dependencies

-   FastAPI
-   Flask
-   uvicorn
-   python-dotenv
-   oracledb
-   requests
-   flask\_cors
-   ipaddress
-   subprocess
-   json
-   datetime

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request with your changes.

## License

This project is licensed under the [MIT License](LICENSE).
