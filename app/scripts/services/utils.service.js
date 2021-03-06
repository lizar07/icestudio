
'use strict';

angular.module('icestudio')
    .service('utils', ['$translate', 'nodeFs', 'nodeFse', 'nodeOs', 'nodePath', 'nodeChildProcess', 'nodeTarball', 'nodeZlib', 'nodeSudo', 'nodeOnline', 'nodeGlob', '_package',
      function($translate, nodeFs, nodeFse, nodeOs, nodePath, nodeChildProcess, nodeTarball, nodeZlib, nodeSudo, nodeOnline, nodeGlob, _package) {

        const WIN32 = Boolean(process.platform.indexOf('win32') > -1);
        const DARWIN = Boolean(process.platform.indexOf('darwin') > -1);
        const LINUX = Boolean(process.platform.indexOf('linux') > -1);

        const CACHE = '_cache';

        const VENV = 'virtualenv-15.0.1';
        const VENV_DIR = nodePath.join(CACHE, VENV);
        const VENV_TARGZ = nodePath.join('resources', 'virtualenv', VENV + '.tar.gz');

        const SAMPLE_DIR = nodePath.join('resources', 'sample');
        this.SAMPLE_DIR = SAMPLE_DIR;

        const APP_DIR = nodePath.dirname(process.execPath);
        const TOOLCHAIN_DIR = nodePath.join(APP_DIR, 'toolchain');
        this.TOOLCHAIN_DIR = TOOLCHAIN_DIR;

        const DEFAULT_APIO = 'default-apio';
        const DEFAULT_APIO_DIR = nodePath.join(CACHE, DEFAULT_APIO);
        const DEFAULT_APIO_TARGZ = nodePath.join(TOOLCHAIN_DIR, DEFAULT_APIO + '.tar.gz');

        const DEFAULT_APIO_PACKAGES = 'default-apio-packages';
        const DEFAULT_APIO_PACKAGES_TARGZ = nodePath.join(TOOLCHAIN_DIR, DEFAULT_APIO_PACKAGES + '.tar.gz');

        const BASE_DIR = process.env.HOME || process.env.USERPROFILE;
        const ICESTUDIO_DIR = nodePath.join(BASE_DIR, '.icestudio');
        const APIO_HOME_DIR = nodePath.join(ICESTUDIO_DIR, 'apio');

        const ENV_DIR = _get_env_dir(nodePath.join(ICESTUDIO_DIR, 'venv'));
        const ENV_BIN_DIR = nodePath.join(ENV_DIR, WIN32 ? 'Scripts' : 'bin');
        const ENV_PIP = nodePath.join(ENV_BIN_DIR, 'pip');
        const ENV_APIO = nodePath.join(ENV_BIN_DIR, WIN32 ? 'apio.exe' : 'apio');
        const APIO_CMD = (WIN32 ? 'set' : 'export') + ' APIO_HOME_DIR=' + APIO_HOME_DIR + (WIN32 ? '& ' : '; ') + ENV_APIO;
        const SYSTEM_APIO = '/usr/bin/apio';

        function _get_env_dir(defaultEnvDir) {
          if (WIN32) {
            // Put the env directory to the root of the current local disk when
            // default path contains non-ASCII characters. Virtualenv will fail to
            for (var i in defaultEnvDir) {
              var char = defaultEnvDir[i];
              if (char.charCodeAt(0) > 127) {
                var defaultEnvDirFormat = nodeOs.parse(defaultEnvDir);
                return nodeOs.format({
                  root: defaultEnvDirFormat.root,
                  dir: defaultEnvDirFormat.root,
                  base: '.icestudiovenv',
                  name: '.icestudiovenv',
                });
              }
            }
          }

          return defaultEnvDir;
        }

        var _pythonExecutableCached = null;
        // Get the system executable
        this.getPythonExecutable = function() {
          if (!_pythonExecutableCached) {
            const possibleExecutables = [];

            if (WIN32) {
              possibleExecutables.push('python.exe');
              possibleExecutables.push('C:\\Python27\\python.exe');
            } else {
              possibleExecutables.push('python2.7');
              possibleExecutables.push('python');
            }

            for (var i in possibleExecutables) {
              var executable = possibleExecutables[i];
              if (isPython2(executable)) {
                _pythonExecutableCached = executable;
                break;
              }
            }
          }
          return _pythonExecutableCached;
        }

        function isPython2(executable) {
          const args = ['-c', 'import sys; print \'.\'.join(str(v) for v in sys.version_info[:2])'];
          try {
            const result = nodeChildProcess.spawnSync(executable, args);
            return 0 === result.status && result.stdout.toString().startsWith('2.7');
          } catch(e) {
            return false;
          }
        }

        this.extractTargz = function(source, destination, callback) {
          nodeTarball.extractTarball(source, destination, function(err) {
            if(err) {
              //console.log(err);
              callback(true);
            }
            else {
              callback();
            }
          });
        }

        this.extractVirtualEnv = function(callback) {
          this.extractTargz(VENV_TARGZ, CACHE, callback);
        }

        function disableClick(e) {
          e.stopPropagation();
          e.preventDefault();
        }

        function enableClickEvent() {
          document.removeEventListener('click', disableClick, true);
        }

        function disableClickEvent() {
          document.addEventListener('click', disableClick, true);
        }

        this.enableClickEvent = enableClickEvent;
        this.disableClickEvent = disableClickEvent;

        this.executeCommand = function(command, callback) {
          nodeChildProcess.exec(command.join(' '),
            function (error, stdout, stderr) {
              // console.log(error, stdout, stderr);
              if (error) {
                enableClickEvent();
                callback(true);
                angular.element('#progress-message')
                  .text(stderr);
                angular.element('#progress-bar')
                  .addClass('notransition progress-bar-danger')
                  .removeClass('progress-bar-info progress-bar-striped active')
                  .text('Error')
                  .attr('aria-valuenow', 100)
                  .css('width', '100%');
              }
              else {
                callback();
              }
            }
          );
        }

        this.makeVenvDirectory = function(callback) {
          if (!nodeFs.existsSync(ICESTUDIO_DIR)) {
            nodeFs.mkdirSync(ICESTUDIO_DIR);
          }
          if (!nodeFs.existsSync(ENV_DIR)) {
            nodeFs.mkdirSync(ENV_DIR);
            this.executeCommand(
              [this.getPythonExecutable(), nodePath.join(VENV_DIR, 'virtualenv.py'), ENV_DIR], callback)
          }
          else {
            callback();
          }
        }

        this.checkDefaultToolchain = function() {
          try {
            // TODO: use tar.gz with sha1
            return nodeFs.statSync(TOOLCHAIN_DIR).isDirectory();
          }
          catch (err) {
            return false;
          }
        }

        this.extractDefaultApio = function(callback) {
          this.extractTargz(DEFAULT_APIO_TARGZ, DEFAULT_APIO_DIR, callback);
        }

        this.installDefaultApio = function(callback) {
          var self = this;
          nodeGlob(nodePath.join(DEFAULT_APIO_DIR, '*.*'), {}, function (error, files) {
            if (!error) {
              self.executeCommand([ENV_PIP, 'install', '-U', '--no-deps'].concat(files), callback);
            }
          });
        }

        this.extractDefaultApioPackages = function(callback) {
          this.extractTargz(DEFAULT_APIO_PACKAGES_TARGZ, APIO_HOME_DIR, callback);
        }

        this.isOnline = function(callback, error) {
          nodeOnline({
            timeout: 5000
          }, function(err, online) {
            if (online) {
              callback();
            }
            else {
              error();
              callback(true);
            }
          });
        }

        this.installOnlineApio = function(callback) {
          this.executeCommand([ENV_PIP, 'install', '-U', 'apio">=' + _package.apio.min + ',<' + _package.apio.max + '"'], callback);
        }

        this.apioInstall = function(_package, callback) {
          this.executeCommand([APIO_CMD, 'install', _package], callback);
        }

        this.toolchainDisabled = false;

        this.getApioExecutable = function() {
          var candidate_apio = process.env.ICESTUDIO_APIO ? process.env.ICESTUDIO_APIO : SYSTEM_APIO;
          if (nodeFs.existsSync(candidate_apio)) {
            if (!this.toolchainDisabled) {
              // Show message only on start
              alertify.notify('Using system wide apio', 'message', 5);
            }
            this.toolchainDisabled = true;
            return candidate_apio;
          }
          this.toolchainDisabled = false;
          return APIO_CMD;
        }

        this.removeToolchain = function() {
          deleteFolderRecursive(ICESTUDIO_DIR);
        }

        var deleteFolderRecursive = function(path) {
          if (nodeFs.existsSync(path)) {
            nodeFs.readdirSync(path).forEach(function(file,index){
              var curPath = nodePath.join(path, file);
              if (nodeFs.lstatSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);
              }
              else { // delete file
                nodeFs.unlinkSync(curPath);
              }
            });
            nodeFs.rmdirSync(path);
          }
        }

        this.sep = nodePath.sep;

        this.basename = basename;
        function basename(filepath) {
          return nodePath.basename(filepath).split('.')[0];
        }

        this.dirname = function(filepath) {
          return nodePath.dirname(filepath);
        }

        this.readFile = function(filepath, callback) {
          nodeFs.readFile(filepath,
            function(err, data) {
              if (!err && callback) {
                decompressJSON(data, callback);
              }
          });
        }

        var saveBin = false;

        this.saveFile = function(filepath, content, callback, compress) {
          if (compress) {
            compressJSON(content, function(compressed) {
              nodeFs.writeFile(filepath, compressed, saveBin ? 'binary' : null,
              function(err) {
                if (!err && callback) {
                  callback();
                }
              });
            });
          }
          else {
            nodeFs.writeFile(filepath, content, function(err) {
              if (!err && callback) {
                callback();
              }
            });
          }
        }

        function compressJSON(json, callback) {
          if (!saveBin) {
            if (callback)
              callback(JSON.stringify(json, null, 2));
          }
          else {
            var data = JSON.stringify(json);
            nodeZlib.gzip(data, function (_, result) {
              if (callback)
                callback(result);
            });
          }
        }

        function decompressJSON(json, callback) {
          var data = isJSON(json);
          if (data) {
            if (callback)
              callback(data);
          }
          else {
            nodeZlib.gunzip(json, function(_, uncompressed) {
              var result = JSON.parse(uncompressed);
              if (callback)
                callback(result);
            });
          }
        }

        function isJSON(str) {
          var result = false;
          try {
            result = JSON.parse(str);
          } catch (e) {
            return false;
          }
          return result;
        }

        this.getFilesRecursive = getFilesRecursive;

        function getFilesRecursive(folder, extension) {
          var fileContents = nodeFs.readdirSync(folder),
              fileTree = [],
              stats;

          fileContents.forEach(function (fileName) {
            var filePath = nodePath.join(folder, fileName);
            stats = nodeFs.lstatSync(filePath);

            if (stats.isDirectory()) {
              fileTree.push({
                name: fileName,
                children: getFilesRecursive(filePath, extension)
              });
            } else {
              if (fileName.endsWith(extension)) {
                var content = JSON.parse(nodeFs.readFileSync(filePath).toString());
                fileTree.push({
                  name: basename(fileName),
                  content: content
                });
              }
            }
          });

          return fileTree;
        }

        this.enableDrivers = function() {
          if (WIN32) {
            enableWindowsDrivers();
          }
          else if (DARWIN) {
            enableDarwinDrivers();
          }
          else {
            linuxDrivers(true);
          }
        }

        this.disableDrivers = function() {
          if (WIN32) {
            disableWindowsDrivers();
          }
          else if (DARWIN) {
            disableDarwinDrivers();
          }
          else {
            linuxDrivers(false);
          }
        }

        function linuxDrivers(enable) {
          if (enable) {
            var commands = [
              'cp ' + nodePath.resolve('resources/config/80-icestick.rules') + ' /etc/udev/rules.d/80-icestick.rules',
              'service udev restart'
            ];
          }
          else {
            var commands = [
              'rm /etc/udev/rules.d/80-icestick.rules',
              'service udev restart'
            ];
          }
          var command = 'sh -c "' + commands.join('; ') + '"';

          beginLazyProcess();
          nodeSudo.exec(command, {name: 'Icestudio'}, function(error, stdout, stderr) {
            // console.log(error, stdout, stderr);
            endLazyProcess();
            if (!error) {
              if (enable) {
                alertify.success($translate.instant('drivers_enabled'));
              }
              else {
                alertify.warning($translate.instant('drivers_disabled'));
              }
              setTimeout(function() {
                 alertify.notify($translate.instant('unplug_and_reconnect'), 'message', 5);
              }, 1000);
            }
          });
        }

        function enableDarwinDrivers() {
          var commands = [
            'kextunload -b com.FTDI.driver.FTDIUSBSerialDriver -q || true',
            'kextunload -b com.apple.driver.AppleUSBFTDI -q || true'
          ];
          var command = 'sh -c "' + commands.join('; ') + '"';

          beginLazyProcess();
          nodeSudo.exec(command, {name: 'Icestudio'}, function(error, stdout, stderr) {
            // console.log(error, stdout, stderr);
            if (error) {
              endLazyProcess();
            }
            else {
              var brewCommands = [
                '/usr/local/bin/brew update',
                '/usr/local/bin/brew install libftdi',
                '/usr/local/bin/brew link --overwrite libftdi'
              ];
              nodeChildProcess.exec(brewCommands.join('; '), function(error, stdout, stderr) {
                // console.log(error, stdout, stderr);
                endLazyProcess();
                if (error) {
                  if ((stderr.indexOf('brew: command not found') != -1) ||
                       (stderr.indexOf('brew: No such file or directory') != -1)) {
                    alertify.notify($translate.instant('homebrew_required'), 'error', 5);
                  }
                  else if (stderr.indexOf('Error: Failed to download') != -1) {
                    alertify.notify($translate.instant('internet_connection_required'), 'error', 5);
                  }
                  else {
                    alertify.notify(stderr, 'error', 5);
                  }
                }
                else {
                  alertify.success($translate.instant('drivers_enabled'));
                }
              });
            }
          });
        }

        function disableDarwinDrivers() {
          var commands = [
            'kextload -b com.FTDI.driver.FTDIUSBSerialDriver -q || true',
            'kextload -b com.apple.driver.AppleUSBFTDI -q || true'
          ];
          var command = 'sh -c "' + commands.join('; ') + '"'

          beginLazyProcess();
          nodeSudo.exec(command, {name: 'Icestudio'}, function(error, stdout, stderr) {
            // console.log(error, stdout, stderr);
            endLazyProcess();
            if (!error) {
              alertify.warning($translate.instant('drivers_disabled'));
            }
          });
        }

        function enableWindowsDrivers() {
          alertify.confirm($translate.instant('install_drivers_windows'), function() {
            beginLazyProcess();
            nodeChildProcess.exec([APIO_CMD, 'drivers', '--enable'].join(' '), function(error, stdout, stderr) {
              // console.log(error, stdout, stderr);
              endLazyProcess();
              if (stderr) {
                alertify.notify($translate.instant('toolchain_not_installed'), 'error', 5);
              }
              if (!error) {
                alertify.notify($translate.instant('unplug_and_reconnect'), 'message', 5);
              }
            });
          });
        }

        function disableWindowsDrivers() {
          alertify.confirm($translate.instant('uninstall_drivers_windows'), function() {
            beginLazyProcess();
            nodeChildProcess.exec([APIO_CMD, 'drivers', '--disable'].join(' '), function(error, stdout, stderr) {
              // console.log(error, stdout, stderr);
              endLazyProcess();
              if (stderr) {
                alertify.notify($translate.instant('toolchain_not_installed'), 'error', 5);
              }
            });
          });
        }

        function beginLazyProcess() {
          $('body').addClass('waiting');
          angular.element('#menu').addClass('disable-menu');
        }

        function endLazyProcess() {
          $('body').removeClass('waiting');
          angular.element('#menu').removeClass('disable-menu');
        }

    }]);
