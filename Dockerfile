FROM node:lts-slim as builder

WORKDIR /build
COPY package.json package-lock.json /build/
RUN npm i
COPY . /build
RUN apt-get update && \
    apt-get install -y openssl && \
    npx prisma generate && \
    npm run build


FROM node:lts-slim

WORKDIR /app
RUN apt-get update && \
    apt-get install -y openssl && \
    apt-get clean
COPY --from=builder /build/dist /app
COPY --from=builder /build/node_modules/.prisma /app/node_modules/.prisma
COPY package.json package-lock.json /app/
RUN npm ci --only=prod
CMD [ "node", "index.js" ]