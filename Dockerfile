FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src
COPY public ./public

ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
USER node

CMD ["node", "src/server.mjs"]
