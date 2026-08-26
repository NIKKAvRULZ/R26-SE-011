const https = require('node:https');

function dohQuery(name, type) {
  return new Promise((resolve, reject) => {
    const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`;
    https.get(url, { headers: { accept: 'application/dns-json' } }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(body).Answer || []); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

function dohLookup(hostname, options, callback) {
  dohQuery(hostname, 'A').then((answers) => {
    const addresses = answers.filter((answer) => answer.type === 1).map((answer) => answer.data);
    if (!addresses.length) {
      const error = new Error(`No A record for ${hostname}`);
      error.code = 'ENOTFOUND';
      callback(error);
      return;
    }
    if (options?.all) callback(null, addresses.map((address) => ({ address, family: 4 })));
    else callback(null, addresses[0], 4);
  }).catch(callback);
}

async function prepareMongoConnection(uri) {
  if (!uri?.startsWith('mongodb+srv://')) return { uri, options: {} };

  const withoutScheme = uri.slice('mongodb+srv://'.length);
  const authorityEnd = withoutScheme.indexOf('/');
  const authority = withoutScheme.slice(0, authorityEnd);
  const at = authority.lastIndexOf('@');
  const credentials = authority.slice(0, at);
  const clusterHost = authority.slice(at + 1);
  const pathAndQuery = withoutScheme.slice(authorityEnd);

  const [srvAnswers, txtAnswers] = await Promise.all([
    dohQuery(`_mongodb._tcp.${clusterHost}`, 'SRV'),
    dohQuery(clusterHost, 'TXT'),
  ]);
  const hosts = srvAnswers.filter((answer) => answer.type === 33).map((answer) => {
    const fields = answer.data.trim().split(/\s+/);
    return `${fields[3].replace(/\.$/, '')}:${fields[2]}`;
  });
  if (!hosts.length) throw new Error(`No MongoDB SRV records found for ${clusterHost}`);

  const txtOptions = txtAnswers.filter((answer) => answer.type === 16)
    .map((answer) => answer.data.replace(/^"|"$/g, ''))
    .join('&');
  const separator = pathAndQuery.includes('?') ? '&' : '?';
  const standardUri = `mongodb://${credentials}@${hosts.join(',')}${pathAndQuery}${separator}tls=true${txtOptions ? `&${txtOptions}` : ''}`;
  return { uri: standardUri, options: { lookup: dohLookup } };
}

module.exports = { prepareMongoConnection };
