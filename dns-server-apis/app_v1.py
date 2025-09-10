from flask import Flask, request, jsonify
import subprocess
import json
from datetime import datetime
import ipaddress
from flask_cors import CORS

app = Flask(__name__)

CORS(app, origins=["http://10.42.0.1:8000", "http://localhost:3000"])

class DNSConfigGenerator:
    def __init__(self):
        pass
    
    def generate_serial(self):
        """Generate serial number in format YYYYMMDDnn"""
        return datetime.now().strftime("%Y%m%d01")
    
    def get_reverse_zone(self, ip_address):
        """Convert IP address to reverse zone format"""
        ip = ipaddress.IPv4Address(ip_address)
        octets = str(ip).split('.')
        return f"{octets[2]}.{octets[1]}.{octets[0]}.in-addr.arpa"
    
    def get_network_prefix(self, ip_address):
        """Get network prefix for allow-query"""
        ip = ipaddress.IPv4Address(ip_address)
        octets = str(ip).split('.')
        return f"{octets[0]}.{octets[1]}.{octets[2]}.0/24"
    
    def generate_named_conf_zones(self, domain, dns_ip):
        """Generate zone configurations for named.conf"""
        reverse_zone = self.get_reverse_zone(dns_ip)
        
        zones_config = f'''zone "{domain}" {{
    type master;
    file "/var/named/db.{domain}";
    allow-transfer {{ none; }};
}};

zone "{reverse_zone}" {{
    type master;
    file "/var/named/db.{'.'.join(dns_ip.split('.')[:-1])}";
    allow-transfer {{ none; }};
}};'''
        
        return zones_config
    
    def generate_options_config(self, dns_ip):
        """Generate options configuration"""
        network_prefix = self.get_network_prefix(dns_ip)
        
        options_config = f'''options {{
    directory       "/var/named";
    recursion       yes;

    allow-query     {{ {network_prefix}; 127.0.0.1; }};
    listen-on port 53 {{ {dns_ip}; 127.0.0.1; }};
    listen-on-v6    {{ none; }};

    dnssec-enable   no;
    dnssec-validation no;

    forwarders {{
  		8.8.8.8;
  		8.8.4.4;
	}};

    forward only;
}};'''
        
        return options_config
    
    def generate_forward_zone(self, domain, dns_ip, host_ip, host1_prefix, host2_prefix):
        """Generate forward zone file"""
        serial = self.generate_serial()
        
        forward_zone = f'''$TTL    86400
@       IN      SOA     ns1.{domain}. admin.{domain}. (
                        {serial} ; Serial (YYYYMMDDnn)
                        3600       ; Refresh
                        1800       ; Retry
                        1209600    ; Expire
                        86400 )    ; Minimum TTL

; Name servers
@       IN      NS      ns1.{domain}.

; A records
ns1     IN      A       {dns_ip}
{host1_prefix}      IN      A       {dns_ip}
{host2_prefix}    IN      A       {host_ip}'''
        
        return forward_zone
    
    def generate_reverse_zone(self, domain, dns_ip, host_ip, host1_prefix, host2_prefix):
        """Generate reverse zone file"""
        serial = self.generate_serial()
        dns_last_octet = dns_ip.split('.')[-1]
        host_last_octet = host_ip.split('.')[-1]
        
        reverse_zone = f'''$TTL    86400
@       IN      SOA     ns1.{domain}. admin.{domain}. (
                        {serial} ; Serial
                        3600       ; Refresh
                        1800       ; Retry
                        1209600    ; Expire
                        86400 )    ; Minimum TTL

; Name servers
@       IN      NS      ns1.{domain}.

; PTR records
{dns_last_octet}       IN      PTR     {host1_prefix}.{domain}.
{host_last_octet}     IN      PTR     {host2_prefix}.{domain}.'''
        
        return reverse_zone

dns_generator = DNSConfigGenerator()

@app.route('/generate-dns-config', methods=['POST'])
def generate_dns_config():
    """Generate DNS configuration files based on user input"""
    try:
        data = request.get_json()
        
        # Extract parameters
        dns_ip = data.get('dns_ip')
        dns_interface = data.get('dns_interface')
        dns_username = data.get('dns_username')
        dns_password = data.get('dns_password')
        
        host_ip = data.get('host_ip')
        host_interface = data.get('host_interface')
        host_username = data.get('host_username')
        host_password = data.get('host_password')
        
        domain = data.get('domain')
        host1_prefix = data.get('host1_prefix')
        host2_prefix = data.get('host2_prefix')
        
        # Validate required fields
        required_fields = [dns_ip, host_ip, domain, host1_prefix, host2_prefix]
        if not all(required_fields):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Generate configurations
        named_conf_zones = dns_generator.generate_named_conf_zones(domain, dns_ip)
        options_config = dns_generator.generate_options_config(dns_ip)
        forward_zone = dns_generator.generate_forward_zone(domain, dns_ip, host_ip, host1_prefix, host2_prefix)
        reverse_zone = dns_generator.generate_reverse_zone(domain, dns_ip, host_ip, host1_prefix, host2_prefix)
        
        # Generate file names
        forward_zone_file = f"db.{domain}"
        reverse_zone_file = f"db.{'.'.join(dns_ip.split('.')[:-1])}"
        
        # Generate commands (without executing them)
        permission_commands = [
            f"sudo chown root:named /var/named/{forward_zone_file}",
            f"sudo chmod 640 /var/named/{forward_zone_file}",
            f"sudo chown root:named /var/named/{reverse_zone_file}",
            f"sudo chmod 640 /var/named/{reverse_zone_file}",
            "sudo named-checkconf",
            f"sudo named-checkzone {domain} /var/named/{forward_zone_file}",
            f"sudo named-checkzone {dns_generator.get_reverse_zone(dns_ip)} /var/named/{reverse_zone_file}",
            "sudo systemctl enable --now named"
        ]
        
        response = {
            'success': True,
            'configurations': {
                'named_conf_zones': named_conf_zones,
                'options_config': options_config,
                'forward_zone': forward_zone,
                'reverse_zone': reverse_zone
            },
            'file_names': {
                'forward_zone_file': forward_zone_file,
                'reverse_zone_file': reverse_zone_file
            },
            'permission_commands': permission_commands,
            'connection_info': {
                'dns_server': {
                    'ip': dns_ip,
                    'interface': dns_interface,
                    'username': dns_username
                },
                'host_server': {
                    'ip': host_ip,
                    'interface': host_interface,
                    'username': host_username
                }
            }
        }
        
        return jsonify(response)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/test-dns', methods=['POST'])
def test_dns():
    """Execute DNS testing commands using subprocess"""
    try:
        data = request.get_json()

        dns_ip = data.get('dns_ip')
        host_ip = data.get('host_ip')
        domain = data.get('domain')
        host1_prefix = data.get('host1_prefix')
        host2_prefix = data.get('host2_prefix')

        if not all([dns_ip, host_ip, domain, host1_prefix, host2_prefix]):
            return jsonify({'error': 'Missing required fields'}), 400

        # Define known commands with fixed keys
        test_commands = {
            "dig_host1": f"dig @{dns_ip} {host1_prefix}.{domain}",
            "dig_host2": f"dig @{dns_ip} {host2_prefix}.{domain}",
            "reverse_lookup": f"dig -x {host_ip}",
            "ping_host1": f"ping -c 4 {host1_prefix}.{domain}",
            "ping_host2": f"ping -c 4 {host2_prefix}.{domain}"
        }

        results = {}

        for key, cmd in test_commands.items():
            try:
                result = subprocess.run(
                    cmd.split(),
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                results[key] = {
                    'command': cmd,
                    'returncode': result.returncode,
                    'stdout': result.stdout,
                    'stderr': result.stderr,
                    'success': result.returncode == 0
                }
            except subprocess.TimeoutExpired:
                results[key] = {
                    'command': cmd,
                    'error': 'Command timed out',
                    'success': False
                }
            except Exception as e:
                results[key] = {
                    'command': cmd,
                    'error': str(e),
                    'success': False
                }

        return jsonify({
            'success': True,
            'test_results': results
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/network-config', methods=['POST'])
def generate_network_config():
    """Generate network configuration commands"""
    try:
        data = request.get_json()
        
        dns_ip = data.get('dns_ip')
        domain = data.get('domain')
        interface = data.get('interface', 'eno1')
        
        if not all([dns_ip, domain]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        network_commands = [
            f'nmcli con mod "{interface}" ipv4.dns "{dns_ip}"',
            f'nmcli con mod "{interface}" ipv4.dns-search "{domain}"',
            f'nmcli con up "{interface}"'
        ]
        
        firewall_commands = [
            'sudo firewall-cmd --permanent --add-service=dns',
            'sudo firewall-cmd --reload',
            'sudo firewall-cmd --permanent --add-icmp-block=echo-reply',
            'sudo firewall-cmd --permanent --remove-icmp-block=echo-request',
            'sudo firewall-cmd --reload'
        ]
        
        return jsonify({
            'success': True,
            'network_commands': network_commands,
            'firewall_commands': firewall_commands
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'DNS Configuration API'})

if __name__ == '__main__':
    app.run(debug=True, host='10.42.0.1', port=5000)
