FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY src ./src
USER node
ENTRYPOINT ["node", "src/server.js"]
