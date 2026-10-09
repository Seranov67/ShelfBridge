FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY src ./src
COPY public ./public
COPY data ./data
COPY scripts ./scripts
RUN npm ci --ignore-scripts --omit=dev --no-audit --no-fund
RUN mkdir .runtime && chown node:node .runtime
USER node
ENV HOST=0.0.0.0 PORT=4318 SHELFBRIDGE_MODE=qloo_only
ENV QLOO_CLI_ENTRY=/app/node_modules/@qloo/qloo-harness/dist/bin.js
EXPOSE 4318
CMD ["node", "scripts/start.mjs"]
