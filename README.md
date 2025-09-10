# DNS Server Configuration Dashboard

## Overview

This Next.js application provides a comprehensive dashboard for configuring, testing, and managing DNS server settings. It allows users to generate DNS configuration files, test DNS server functionality, configure network settings, and review historical test results.

## Features

-   **Configuration Management**: Configure DNS and host server settings through an intuitive user interface.
-   **DNS Configuration Generation**: Generate DNS zone files and configuration files (forward zone, reverse zone, named.conf zones, options config) based on user-defined settings.
-   **Network Configuration**: Generate network and firewall configuration commands to properly set up the DNS server.
-   **Enhanced DNS Testing**: Perform detailed DNS tests, including forward and reverse lookups, and ping tests, with visual representation of results.
-   **Historical Test Results**: Retrieve and analyze historical DNS test sessions using session IDs.
-   **Configuration Search**: Search and review previously stored DNS configurations by interface.

## Technologies Used

-   Next.js
-   React
-   Tailwind CSS
-   Radix UI
-   Lucide React Icons

## Setup

### Prerequisites

-   Node.js (>=18.x)
-   npm or yarn

### Installation

1.  Clone the repository:

    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  Install dependencies:

    ```bash
    npm install # or yarn install
    ```

### Environment Variables

This application requires the following environment variables:

-   `NEXT_PUBLIC_API_URL`: The base URL for the backend API (e.g., `http://10.42.0.1:5000`).

Create a `.env.local` file in the root directory and add the necessary environment variables:

```
NEXT_PUBLIC_API_URL=http://10.42.0.1:5000
```

### Running the Application

Start the development server:

```bash
npm run dev # or yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the dashboard.

## Usage

1.  **Configure**: Enter DNS server and host configuration details in the "Configure" tab.
2.  **Generate**: Generate DNS configuration files by clicking the "Generate Configuration" button in the "Generate" tab.
3.  **Network**: Generate network and firewall configuration commands by clicking the "Generate Network Config" button in the "Network" tab.
4.  **Test**: Run DNS tests and view detailed analytics in the "Test" tab.
5.  **History**: Retrieve historical test results by entering a session ID in the "History" tab.
6.  **Search**: Search for stored configurations by interface name in the "Search" tab.

## API Endpoints

The application interacts with the following API endpoints:

-   `POST /generate-dns-config`: Generates DNS configuration files.
-   `POST /test-dns`: Runs DNS tests.
-   `POST /network-config`: Generates network configuration commands.
-   `GET /test-results/:sessionId`: Retrieves historical test results for a given session ID.
-   `GET /search-dns-server-config/:interface`: Searches stored DNS configurations by interface.

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request with your changes.

## License

[MIT](LICENSE)