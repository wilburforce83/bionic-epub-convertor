const express = require('express');
const xmlbuilder = require('xmlbuilder');
const fs = require('fs');
const path = require('path');

function createOpdsServer(epubsDir) {
  const app = express();

  // Serve EPUB files from the specified directory
  app.use('/epubs', express.static(epubsDir));

  // OPDS feed route
  app.get('/opds', (req, res) => {
    const feed = xmlbuilder.create('feed', { encoding: 'utf-8' })
      .att('xmlns', 'http://www.w3.org/2005/Atom')
      .att('xmlns:opds', 'http://opds-spec.org/2010/catalog');

    feed.ele('id', 'urn:uuid:example-opds-catalog');
    feed.ele('title', 'Example OPDS Catalog');
    feed.ele('updated', new Date().toISOString());

    // Read the EPUB directory and add entries for each EPUB file
    fs.readdir(epubsDir, (err, files) => {
      if (err) {
        console.error('Could not list the directory.', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      files.forEach((file, index) => {
        if (path.extname(file) === '.epub') {
          const entry = feed.ele('entry');
          entry.ele('title', path.basename(file, '.epub'));
          entry.ele('id', `urn:uuid:${file}`);
          entry.ele('updated', new Date().toISOString());
          entry.ele('content', `EPUB book: ${file}`);
          entry.ele('link', { 
            href: `${req.protocol}://${req.get('host')}/epubs/${file}`, 
            rel: 'http://opds-spec.org/acquisition', 
            type: 'application/epub+zip' 
          });
        }
      });

      res.set('Content-Type', 'application/atom+xml');
      res.send(feed.end({ pretty: true }));
    });
  });

  return app;
}

module.exports = createOpdsServer;
