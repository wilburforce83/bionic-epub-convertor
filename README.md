
# Dyslibria Epub Library Management System

Dyslibria is a simple bionic reading conversion app for epub files, with an online library and reader. This is an open-source alogrythm designed by me, it is not the same as the official bionic font, and no copyright infringment is intended, this is for free-use and open-sourced for self hosting designed to handle and process your own EPUB files. It includes features such as file uploads, EPUB processing, desktop and mobile support for library management and a WebDAV and opds server for easy file access for mobile app like Moonreader etc

## Features

- Automatic conversion of Epub files to bionic text
- Processed files can be directed to Calibre library automatically.
- Full desktop and mobile device navigation and reading of processed books.
- OPDS server integration for eBook distribution (for some reason that I can't work out opds doesn't work with Moon Reader, on Android please use FBReader)
- Self-host on your own server (Raspberry Pi etc)
- WebDav support if you are a Neanderthal.

## Getting Started

These instructions will get you set up with your own self-hosted version of Dyslibria.

### Prerequisites

Before you start, ensure you have Node.js and npm installed on your system. You can download them from [Node.js official website](https://nodejs.org/).

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/wilburforce83/bionic-epub-convertor.git
   cd bionic-epub-convertor
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment variables:**

Note; if you want to access Dyslibria outside your home network you will need to add a `BASE_URL` to `.env`. As external access is through port forwarding this URL must include the port you have opened and forwarded to in your router; this might be the same, or different to your application port.

   Create a `.env` file in the root directory of your project and update it with your specific settings:

   ```plaintext
   MAIN_PORT=3000
   WEBDAV_PORT=1900
   WEBDAV_USERNAME=dys
   WEBDAV_PASSWORD=password
   BASE_URL=yoururlandport // use this for external access to opds if you are port forwarding 
   ```

4. **Start the application:**

   ```bash
   npm start
   ```

   This command will start both the main server on `http://localhost:3000` and the WebDAV server on `http://localhost:1900`.

### Using PM2 with the Dyslibria Library Management System

PM2 is a process manager for Node.js applications that provides an easy way to manage and daemonize applications. It allows you to keep applications alive forever, reload them without downtime, and facilitate common DevOps tasks.

#### Installing PM2

To install PM2, run the following command:

```bash
npm install pm2 -g
```

#### Starting the Application with PM2

To start Dyslibria with PM2, navigate to the project directory and use the following command:

```bash
pm2 start server.js --name dyslibria
```

#### Monitoring Your Application

Once your application is running under PM2, you can monitor it using the following command:

```bash
pm2 list
```

This command displays a list of all processes currently managed by PM2. To get more detailed information about the Dyslibria process, use:

```bash
pm2 show dyslibria
```

#### Managing Application Logs

PM2 automatically handles the logs. You can view the logs by using:

```bash
pm2 logs dyslibria
```

To view logs in real-time, just run the above command without any additional parameters.

#### Stopping and Restarting the Application

To stop the application managed by PM2, use:

```bash
pm2 stop dyslibria
```

To restart the application, use:

```bash
pm2 restart dyslibria
```

These commands are particularly useful for applying updates or configuration changes.

#### Enabling Startup Scripts

To ensure your application starts on boot, you can use PM2’s startup script generator:

```bash
pm2 startup
```

After running this command, PM2 will provide you with a command that you need to execute with superuser privileges. This command registers a PM2 process to revive on startup.

#### Saving Your Configuration

After configuring your processes, you can save the list with:

```bash
pm2 save
```

This command saves the current running processes and their configurations, allowing PM2 to restore them on restart or after a crash.

### Directory Structure

- `uploads/`: Temporary storage for uploaded EPUB files (Default can be changed in the UI).
- `processed/`: Where processed EPUB files are stored (Default can be changed in the UI).
- `temp/`: Temporary files during EPUB processing.
- `public/`: Static files accessible publicly.
- `authenticated/`: Protected static files for authenticated users.

## Usage

### Logging In

Navigate to `http://localhost:3000/` and enter the credentials as defined in your `.env` file to access the authenticated sections of the application. If you didn't specify login details the default of `dys` and `password` will have been generated.

### Uploading EPUBs

Files can be uploaded through the `/upload` route either via the provided web interface or programmatically using tools like `curl`. Or, simply drag and drop the Epub file into the uploads folder.

### Accessing EPUBs outside the web portal

Processed EPUBs can be accessed through the WebDAV server or directly via the OPDS feed at `http://localhost:3000/opds`.


## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Acknowledgments

- Node.js community
- EPUB.js library
- Fomantic UI
- Any other library or developer whose code was used.