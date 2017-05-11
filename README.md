# o2r muncher

![Travis CI](https://api.travis-ci.org/o2r-project/o2r-muncher.svg)
[![](https://images.microbadger.com/badges/image/o2rproject/o2r-muncher.svg)](https://microbadger.com/images/o2rproject/o2r-muncher "Get your own image badge on microbadger.com")

Node.js implementation of the endpoints `/api/v1/compendium` (reading and metadata update) and `/api/v1/jobs` of the [o2r-web-api](http://o2r.info/o2r-web-api/).

Requirements:

- Node.js `>= 6.2`
- npm
- Python `>= 3.x`
- bagit-python (`bagit.py`)
- o2r-meta (`o2rmeta.py`)
- unzip
- tar
- mongodb

## Dockerfile

This project includes a `Dockerfile` which can be built with

```bash
docker build -t muncher .
```

The image can then be run and configured via environment variables. For convenience, we include a `docker-compose` configuration, which can be run with

```bash
cd docker-compose
docker-compose up
# after you're done, shutdown and delete all volumes (data):
docker-compose down -v
```

__Please keep in mind that muncher needs access to a Docker daemon.__
For this purpose the `docker-compose` configuration will expose your local Docker socket to the muncher container. If you do not want that, you can point muncher to a different Docker host via the `MUNCHER_DOCKER_HOST` and `MUNCHER_DOCKER_PORT` environment variables.

### Available environment variables

You can override these environment variables (configured in `config/config.js`) when starting the service.

- `MUNCHER_DOCKER_HOST`
  Define a different Docker Remote API location to connect to. If omitted, muncher will try to connect to the local unix socket.
- `MUNCHER_DOCKER_PORT`
  Port for Docker Remote API.
- `MUNCHER_PORT`
  Define on which Port muncher should listen. Defaults to `8080`.
- `MUNCHER_MONGODB` __Required__
  Location for the mongo db. Defaults to `mongodb://localhost/`. You will very likely need to change this.
- `MUNCHER_MONGODB_DATABASE`
  Which database inside the mongo db should be used. Defaults to `muncher`.
- `MUNCHER_BASEPATH`
  Base path for the compendia storage. Defaults to `/tmp/muncher`. If you want persistent compendia storage, you should point this to a separate volume.
- `MUNCHER_EMAIL_TRANSPORT`, `MUNCHER_EMAIL_RECEIVERS`, `MUNCHER_EMAIL_SENDER`
  Email configuration settings for sending emails when critical events in the server occure, based on [nodemailer](https://www.npmjs.com/package/nodemailer). `_TRANSPORT` ist the mail transport string, see nodemailer documented, `_RECEIVERS` is a comma-seperated list, and `_SENDER` is the mails sender. All three must be set. Mail notification can also be disabled completely via `config.js`.
- `MUNCHER_META_TOOL_EXE` __Required__
  Executable for metadata tools, defaults to `python3 ../o2r-meta/o2rmeta.py`. You will very likely need to change this.
- `MUNCHER_META_EXTRACT_MAPPINGS_DIR` __Required__
  Path to extraction mappings, defaults to `../o2r-meta/broker/mappings`. You will very likely need to change this.

### Full API service with docker-compose

The o2r muncher only provides the main parts of the o2r web API. For example, serving the data (files) from the compendia is handled by o2r-contentbutler. To show a simple example implementation integrating both services, there is a Docker compose configuration in the file `docker-compose/docker-compose.full.yml`.

```bash
docker-compose -f docker-compose/docker-compose.full.yml up
# after you're done, shutdown and delete all volumes (data):
docker-compose -f docker-compose/docker-compose.full.yml down -v
```

The API is then available at http://localhost/api/v1/compendium and should reply "no compendium found".

To inspect the database, run `docker network inspect dockercompose_default` (or find out the network name before with `docker network ls`) to find out the IP of the database container. Then connect to it (e.g. with adminMongo) using `mongodb://<ip>`.

## Job execution steps

The job's execution steps are documented in the [o2r web-api documentation](http://o2r.info/o2r-web-api/job/).

(Note to developers: function names for these steps may differ!)

## Docker connection

The connection to the Docker API is build on [dockerode](https://www.npmjs.com/package/dockerode) which allows execution on any Docker host that exposes the port. Most commonly, the default configuration will be used, i.e. the local Docker socket is mounted at the default location into the container running muncher.

## Testing

Testing is based on mocha integration tests. A MongoDB database must be running at the default port for the tests to work and must be started manually.

**Attention:** The database is cleared automatically before the test from all existing compendia and jobs!

To be able to test job execution and compendia metadata update, the tests automatically start a Docker container of o2r-loader.

```bash
# must start with replica set for oplog (finder) to work, see https://docs.mongodb.com/manual/tutorial/convert-standalone-to-replica-set/ and https://docs.mongodb.com/manual/tutorial/deploy-replica-set-for-testing/
mongod --dbpath ./db --replSet rso2r --smallfiles;

npm test

# you can also run the tests towards a manually specified host
TEST_HOST=http://localhost:80 npm test

# you can also disable the loader container
LOADER_CONTAINER=no TEST_HOST=http://localhost npm test
```

## Development

### Notes

- mongoose models are independent in the different microservices (i.e. they must only contain the "fields" that are needed in each service), though writing microservices should contain the whole schema (copy and paste it)
- to develop the muncher (or any other microservice) it is easiest to run the full Docker compose configuration and point the microservice to the database within that configuration
  - see above for instructions to run compose configuration
  - `DEBUG=* MUNCHER_MONGODB=mongodb://172.19.0.2 MUNCHER_PORT=8079 npm start`
  - Note that this has considerable limitations, because the data is stored somewhere in the containers etc.

### Removing all containers/images created by muncher

```bash
docker ps -a | grep bagtainer | awk '{print $1}' | xargs --no-run-if-empty docker rm

docker images --no-trunc | grep bagtainer | awk '{print $3}' | xargs --no-run-if-empty docker rmi -f
```

### Steps for starting a local development environment _manually_

The following steps assume that you have all the required projects (`o2r-contentbutler`, `o2r-muncher`, `o2r-platform`) in one directory. Repository updates (`git pull`, `npm install`, `bower install` and the like) are not shown.

```bash
mkdir /tmp/o2r-mongodb-data
mongod --dbpath /tmp/o2r-mongodb-data
# new terminal: start contentbutler (default port 8081)
cd ../o2r-contentbutler
DEBUG=* npm start
# new terminal: start muncher (default port 8080)
cd ../o2r-muncher
DEBUG=* npm start
# new terminal: run tests to add test data
npm test
# new terminal: run a webservice container in daemon mode on port 80 with (a) a proxy in front of the microservices and (b) the client project at / (must change app constant manually!)
cd ../o2r-platform
docker run --rm --name o2r-platform -p 80:80 -v $(pwd)/test/nginx.conf:/etc/nginx/nginx.conf -v $(pwd):/etc/nginx/html nginx
# do work, restart respective apps as needed
```

Alternatively, start the component under development from your IDE.

Be aware that the different services run on their own port, so it might have to be changed manually when navigating through the API.

### Authentication and upload

You can authenticate locally with OAuth as well.

To upload compendia, the user must have the appropriate level. If you want to upload from the command line, get the session cookie out of the browser and use it in the curl request:

```bash
curl --cookie connect.sid=s:S1oH7... -F "compendium=@/<path to compendium.zip>;type=application/zip" -F "content_type=compendium_v1"
```

See `o2r-bagtainers/README.md` on using the much more convenient *uploader container*.

### User levels

Users are authenticated via OAuth and the actions on the website are limited by the `level` assocciated with an account.
On registration, each account is assigned a level `0`. Below is a list of actions and the corresponding required user level.
_To adjust a user's level, you currently have to log in to the database and change the stored JSON string._

- `0` Create new jobs
- `100` Upload new compendium
- `1000` and above are admins
  - edit users
  - delete compendia and jobs (TBD)

## License

o2r muncher is licensed under Apache License, Version 2.0, see file LICENSE.

Copyright (C) 2016 - o2r project.
