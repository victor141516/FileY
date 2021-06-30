#!/bin/sh

npx prisma migrate deploy
exec node index.js
