FROM node:24-bookworm-slim AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

FROM node:24-bookworm-slim

ENV NODE_ENV=production

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app /usr/src/app

EXPOSE 3000
EXPOSE 1900

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.MAIN_PORT || 3000) + '/healthz').then((res) => { process.exit(res.ok ? 0 : 1); }).catch(() => process.exit(1))"

CMD ["npm", "start"]
