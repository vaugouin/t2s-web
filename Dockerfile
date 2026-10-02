FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4180
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node web/ ./web/
USER node
EXPOSE 4180
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node --input-type=module -e "import {loadConfig} from './server.mjs'; fetch('http://127.0.0.1:4180'+loadConfig().basePath+'health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
