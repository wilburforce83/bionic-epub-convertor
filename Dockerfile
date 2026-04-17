FROM node:20-bookworm-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000
EXPOSE 1900

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.MAIN_PORT || 3000) + '/healthz').then((res) => { process.exit(res.ok ? 0 : 1); }).catch(() => process.exit(1))"

CMD ["npm", "start"]
