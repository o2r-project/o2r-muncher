# o2r muncher

![Travis CI](https://api.travis-ci.org/o2r-project/o2r-muncher.svg)
[![](https://images.microbadger.com/badges/image/o2rproject/o2r-muncher.svg)](https://microbadger.com/images/o2rproject/o2r-muncher "Get your own image badge on microbadger.com") [![](https://images.microbadger.com/badges/version/o2rproject/o2r-muncher.svg)](https://microbadger.com/images/o2rproject/o2r-muncher "Get your own version badge on microbadger.com")

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

## Run

This project includes a `Dockerfile` which can be built and run with the following commands.

```bash
docker build -t muncher .

docker run --name mongodb -d -p 27017:27017 mongo:3.4

DEBUG=muncher,muncher:* docker run -it -p 8080:8080 --link mongodb:mongodb -v /var/run/docker.sock:/var/run/docker.sock -e MUNCHER_MONGODB=mongodb://mongodb:27017 -e DEBUG=muncher,muncher:* muncher
```

## Configuration

You can override these environment variables (configured in `config/config.js`) when starting the service to configure it.

- `MUNCHER_PORT`
  Define on which Port muncher should listen. Defaults to `8080`.
- `MUNCHER_MONGODB` __Required__
  Location for the mongo db. Defaults to `mongodb://localhost/`. You will very likely need to change this.
- `MUNCHER_MONGODB_DATABASE`
  Which database inside the MongoDB should be used? Defaults to `muncher`.
- `MUNCHER_BASEPATH`
  Base path for the compendia storage. Defaults to `/tmp/o2r`. If you want persistent compendia storage, you should point this to a separate volume.
- `MUNCHER_EMAIL_TRANSPORT`, `MUNCHER_EMAIL_RECEIVERS`, `MUNCHER_EMAIL_SENDER`
  Email configuration settings for sending emails when critical events in the server occure, based on [nodemailer](https://www.npmjs.com/package/nodemailer). `_TRANSPORT` ist the mail transport string, see nodemailer documented, `_RECEIVERS` is a comma-seperated list, and `_SENDER` is the mails sender. All three must be set. Mail notification can also be disabled completely via `config.js`.
- `MUNCHER_META_TOOL_EXE` __Required__
  Executable for metadata tools, defaults to `python3 ../o2r-meta/o2rmeta.py`. You will very likely need to change this.
- `MUNCHER_META_EXTRACT_MAPPINGS_DIR` __Required__
  Path to extraction mappings, defaults to `../o2r-meta/broker/mappings`. You will very likely need to change this.
- `MUNCHER_FAIL_ON_NO_FILES`
  Should an error be thrown when files for a compendium that exists in the database are _not found_? Defaults to `false` (useful for testing).

The connection to the Docker API is build on [dockerode](https://www.npmjs.com/package/dockerode) which allows execution on any Docker host that exposes the port.
Most commonly, the default configuration will be used, i.e. the local Docker socket is mounted at the default location into the container running muncher (see [above](#run))


## Testing

Testing is based on mocha integration tests. A MongoDB database must be running at the default port for the tests to work and must be started manually.

**Attention:** The database is cleared completely several times during tests!

To be able to test job execution and compendia metadata update, the tests _may_ automatically start a Docker container of o2r-loader.

```bash
# must start with replica set for oplog (finder) to work, see https://docs.mongodb.com/manual/tutorial/convert-standalone-to-replica-set/ and https://docs.mongodb.com/manual/tutorial/deploy-replica-set-for-testing/
mongod --dbpath ./db --replSet rso2r --smallfiles;

npm run test_loader

# you can also run the tests towards a manually specified host
TEST_HOST=http://localhost:80 npm test

# you can also disable the loader container
LOADER_CONTAINER=no TEST_HOST=http://localhost npm test
# or
npm run test
```

## Development

### Removing all containers/images created by muncher

```bash
docker ps -a | grep erc | awk '{print $1}' | xargs --no-run-if-empty docker rm

docker images --no-trunc | grep erc | awk '{print $3}' | xargs --no-run-if-empty docker rmi -f
```

### Steps for starting a local development environment _manually_

The following steps assume that you have all the required projects (`o2r-contentbutler`, `o2r-muncher`, `o2r-loader`, `o2r-platform`) in one directory. Repository updates (`git pull`, `npm install`, `bower install` and the like) are not shown.

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
curl --cookie connect.sid=s:S1oH7... -F "compendium=@/<path to compendium.zip>;type=application/zip" -F "content_type=compendium"
```

See `o2r-bagtainers/README.md` on using the much more convenient *uploader container*.

See the [o2r Web API docs](http://o2r.info/o2r-web-api/user/#user-levels) for information on **user levels**.

### Create bags for testing

The following code uses `bagit.py` to create, validate, or load and update an existing bag _in place_:

```bash
# create bag
python -c "import bagit; bag = bagit.make_bag('success-validate');"

# validate bag
python -c "import bagit; bag = bagit.Bag('success-load-validate'); print('Is Bag valid?', bag.validate());"

# update manifest and validate it with (run twice)
python -c "import bagit; bag = bagit.Bag('success-load-validate'); bag.save(manifests=True); print('Updated manifest. Is Bag valid?', bag.validate());"
```

## License

o2r muncher is licensed under Apache License, Version 2.0, see file LICENSE.

Copyright (C) 2017 - o2r project.
