var debug = require('debug')('executor');
var Promise = require('bluebird');
var fs = require('fs');
//var tar = require('tar');
var exec = require('child_process').exec;
var fstream = require('fstream');
var Docker = require('dockerode');
var yaml = require('yamljs');
var Bag = require('bagit');

function Executor(packageName, basePath) {
  // setup Executor
  this.basePath = basePath || 'workspace/';
  if(!packageName) {
    return false;
  }
  this.packageName = packageName;
  this.bag = {};
  this.bagtainer = {};
  // setup Docker client
  var docker = new Docker();

  /**
   *  Load the associated bag, check if it's valid.
   */
  this.loadBag = () => {
    return new Promise((fulfill, reject) => {
      this.bag = new Bag(this.basePath + this.packageName);
      this.bag.validate('fast')
      .catch(e => {
        reject('loadBag: ' + e);
      })
      .then(() => {
        fulfill();
      });
    });
  };

  /**
   *  Parse the Bagtainer.yml, save content
   */
  this.parseBagtainer = (passon) => {
    return new Promise((fulfill, reject) => {
      try {
        var input = fs.readFileSync(this.basePath + this.packageName +
          '/data/Bagtainer.yml', 'utf-8');
        this.bagtainer = yaml.parse(input);
        fulfill(passon);
      }
      catch (e) {
        reject('parseBagtainer: ' + e);
      }
    });
  };

  /**
   *  Put Bag-Payload in a tarball, needed to pass on to docker server
   */
  this.packData = (passon) => {
    return new Promise((fulfill, reject) => {
      if(this.bagtainer.data.container) {
        exec('tar -cf /tmp/' + this.packageName + '.tar *',
        {cwd: this.basePath + this.packageName + '/data'},
        (error, stoud, stderr) => {
          if (error) {
            reject('packData: error while packing: ' + error);
          } else {
            fulfill(passon);
          }
        });

      // TODO: find tar-module that can save seperate files in the root.

      /*  var output = fs.createWriteStream('/tmp/' + this.packageName + '.tar');
        var packer = tar.Pack({noProprietary: true})
          .on('error', reject)
          .on('end', () => {fulfill(passon);});

        fstream.Reader({ path: this.basePath + this.packageName + '/data',
          type: 'Directory' })
          .on('error', reject)
          .pipe(packer)
          .pipe(output);*/
      } else {
        reject('packData: no container directory specified');
      }
    });
  };

  /**
   *  Submit tarball to docker server, build Image from that
   */
  this.buildImage = (passon) => {
    return new Promise((fulfill, reject) => {
      if(this.bagtainer.data.container) {
        docker.buildImage('/tmp/' + this.packageName + '.tar',
            {t: 'bagtainer:' + this.packageName},
        (err, response) => {
          if(err) {
            reject(err);
          } else {
            body = '';
            response.on('data', d => {
              debug(JSON.parse(d.toString('utf8')).stream);
              body += d;
            });
            response.on('end', () => {
              fulfill(passon);
            });
          }
        });
      } else {
        reject('buildImage: no container directory specified');
      }
    });
  };

  /**
   *  Run the container from previously build Image
   */
  this.runContainer = (passon) => {
    return new Promise((fulfill, reject) => {
      docker.run('bagtainer:' + this.packageName, [], process.stdout, '', '--rm',
      (error, data, container) => {
        if (error) {
          reject(error);
        } else {
          if(data.StatusCode) { 
            reject('runContainer: exit StatusCode ' + data.StatusCode);
          } else {
            fulfill(passon);
          }
        }
      });
    });
  };

  /**
   *  Cleanup unnecessary files?
   */
  this.cleanup = (passon) => {
    return new Promise((fulfill, reject) => {
      debug('cleanup: Ich putz\' hier nur.');
      fulfill(passon);
    });
  };

  this.execute = () => {
    return this.loadBag()
      .then(this.parseBagtainer)
      .then(this.packData)
      .then(this.buildImage)
      .then(this.runContainer)
      .then(this.cleanup);
  };
}

module.exports.Executor = Executor;
