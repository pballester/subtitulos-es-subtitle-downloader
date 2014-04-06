var request = require('request'),
	cheerio = require('cheerio'),
	async = require('async'),
	path = require('path'),
	fs = require('fs'),
	admZip = require('adm-zip');

exports.show = function(req, res){
	var urlToGetSeasons = "http://www.subtitulos.es/show/" + req.params.id,
		reSeason = /\,(\d{1,})\)/,
		arrayFilesToDownload = [],
		reResult, $, seasons, urlToGetDownloads, i, zip;
	//Gets the seasons of the tvShow
	console.log("Searching seasons for tvShow: "+req.params.id);
	request(urlToGetSeasons, function(err, resp, body) {
		if (err) {
			throwError("Conection error");
			return;
		}
		$ = cheerio.load(body);
		reResult = reSeason.exec($("body").attr("onload"));
		if (reResult !== null) {
			seasons = reResult[1];
			console.log("Found "+ seasons +" seasons for tvShow: "+req.params.id);
			//Gets the download page of the subtitles
			urlToGetDownloads = "http://www.subtitulos.es/ajax_loadShow.php?show="+req.params.id+"&season="+seasons;
			request(urlToGetDownloads, function(err, resp, body) {
				if (err) {
					throwError("Conection error");
					return;
				}
				arrayFilesToDownload = getFilesToDownload(body);
				if (arrayFilesToDownload.length > 0) {
					async.series({
						downloadSubtitleFiles: downloadSubtitleFiles,
						createZipFile: createZipFile
					});
				}
				else {
					//No substitles found
					throwError("No subtitles found");
				}
			});
		} 
		else {
			//No seasons found
			throwError("No seasons found");
		}
	});
	function throwError(msg) {
		var error = new Error(msg);
		console.log("ERROR: "+msg);
		res.render('error', {
			message: error.message,
			error: error
		});
	}
	function getFilesToDownload(body) {
		var reLang = /Español \(España\)/,
			arrayFilesToDownload = [],
			languageDomObjects;
		$ = cheerio.load(body);
		languageDomObjects = $(".language");
		for (i = 0; i < languageDomObjects.length; i++) {
			if (reLang.test(cheerio(languageDomObjects[i]).text().trim())) {
				arrayFilesToDownload.push(cheerio(languageDomObjects[i]).parent().find("a").attr("href"));
			}
		}
		console.log("Found "+ arrayFilesToDownload.length +" subtitles for tvShow: "+req.params.id);
		return arrayFilesToDownload;
	}
	function downloadSubtitleFiles(callback) {
		var reFileName = /filename=\"(.*)\"/,
			downloadCounter = 0,
			options, fileName;
		zip = new admZip();
		for (i = 0; i < arrayFilesToDownload.length; i++) {
			options = {
				url: arrayFilesToDownload[i],
				headers: {
					"referer": "http://www.subtitulos.es/"
				},
				encoding: "binary"
			};
			request(options, function(err, resp, body) {
				if (err) {
					console.log("Error downloading subtitle with url: "+ options.url +" "+ err);
					downloadCounter++;
					return;
				}
				if (resp.headers['content-disposition'] !== null) {
					reResult = reFileName.exec(resp.headers['content-disposition']);
					if (reResult !== null) {
						fileName = cleanString(reResult[1]);
					} 
					else {
						fileName = "unknown";
					}
				} 
				else {
					fileName = "unknown";
				}
				console.log("Subtitle " + fileName + " downloaded");
				downloadCounter++;
				zip.addFile(fileName, new Buffer(body));
				if (downloadCounter === arrayFilesToDownload.length) {
					callback(null);
				}
			});
		}
	}
	function createZipFile(callback) {
		var zipPath;
		zipPath = path.join(res.locals.tmpFolder,req.params.id + "-" + seasons + ".zip");
		zip.writeZip(zipPath);
		console.log("Zip archive created in "+ zipPath);
		res.download(zipPath, function(err){
			fs.unlink(zipPath, function(err) {
				if(err) {
					console.log("Error deleting the zip file");
					return;
				}
				console.log("Zip file deleted");
			});
		});
		callback(null);
	}
	function cleanString(strAccents) {
		var strAccents = strAccents.split(''),
			strAccentsOut = new Array(),
			strAccentsLen = strAccents.length,
			accents = 'ÀÁÂÃÄÅàáâãäåÒÓÔÕÕÖØòóôõöøÈÉÊËèéêëðÇçÐÌÍÎÏìíîïÙÚÛÜùúûüÑñŠšŸÿýŽžñÑ',
			accentsOut = "AAAAAAaaaaaaOOOOOOOooooooEEEEeeeeeCcDIIIIiiiiUUUUuuuuNnSsYyyZznN",
			y;
		for (y = 0; y < strAccentsLen; y++) {
			if (accents.indexOf(strAccents[y]) !== -1) {
				strAccentsOut[y] = accentsOut.substr(accents.indexOf(strAccents[y]), 1);
			} else
				strAccentsOut[y] = strAccents[y];
		}
		strAccentsOut = strAccentsOut.join('');
		return strAccentsOut;
	}
};