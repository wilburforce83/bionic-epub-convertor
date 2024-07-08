# Use an official Node.js runtime as a parent image
FROM node:16

# Set the working directory in the container
WORKDIR /usr/src/app

# Install dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

RUN npm install

# Bundle app source inside Docker image
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Run the application
CMD ["node", "server.js"]
