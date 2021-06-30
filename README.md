# FileY (formerly [FileX](https://github.com/victor141516/FileXbot-telegram))

A file manager in Telegram

## Build

```sh
docker build -t victor141516/filey .
```

## Run

### Create a network
```sh
docker network create filey
```

### Run the database
```sh
# You can change the password, but you have to change it also in the app container
# You can change the path where the database will be stored
docker run -d \
    --name filey-postgres \
    --network filey \
    -e POSTGRES_USER=filey \
    -e POSTGRES_DB=filey \
    -e POSTGRES_PASSWORD=password \
    -e PGDATA=/var/lib/postgresql/data/pgdata \
    -v "$HOME/filey/db:/var/lib/postgresql/data" \
    postgres
```

### Option 1: Polling mode
```sh
docker run -d \
    --name filey-app \
    --network filey \
    -e TG_BOT_TOKEN=<your telegram bot api token> \
    -e "DATABASE_URL=postgresql://filey:password@filey-postgres:5432/filey?schema=public" \
    victor141516/filey
```

### Option 2: Webhook mode. You will have to use a reverse proxy to get SSL
```sh
docker run -d \
    --name filey-app \
    --network filey \
    -e TG_BOT_TOKEN=<your telegram bot api token> \
    -e "DATABASE_URL=postgresql://filey:password@filey-postgres:5432/filey?schema=public" \
    -e HTTP_SERVE=true \
    -e "WEBHOOK_HOST=<the host with https that will be externally called by telegram servers>" \
    -e "WEBHOOK_PATH=<the path that will be used after the WEBHOOK_HOST part>" \
    -e PORT=<the port to serve internally (default: 3000)> \
    victor141516/filey
```

Just to clarify the `WEBHOOK_HOST` and `WEBHOOK_PATH` part:

```
 https://example.com - /blabla/anything/you/want
|   WEBHOOK_HOST     |       WEBHOOK_PATH       |

```


## ToDo

- [ ] Be able to modify the FS using a HTTP API
- [ ] FUSE
- [ ] Command to toggle the show of delete and rename buttons


## Personal

This is the line I use to deploy my own instance of the bot, and it's here just so I can copy it easyly. You can ignore it as it'll be useless for you:

```sh
docker build -t victor141516/filey:latest . && docker push victor141516/filey:latest && ssh victor141516@viti.site 'zsh -i -c "docker-update-container filey-app"'
```