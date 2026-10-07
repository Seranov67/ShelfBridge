FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY data ./data
RUN npm install --no-save --ignore-scripts --omit=dev --no-audit --no-fund @qloo/qloo-harness@0.1.26
RUN mkdir .runtime && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=4318
ENV QLOO_CLI_ENTRY=/app/node_modules/@qloo/qloo-harness/dist/bin.js
EXPOSE 4318
CMD ["node", "src/server.mjs"]
