const fs = require('fs');
const https = require('https');
const FormData = require('form-data');
const path = require('path');

const apiKey = 'e06861d0747a4dd43d1f24140b84fbfd';
const filePath = path.resolve(__dirname, '../uploads/Hd.jpg');

const form = new FormData();
form.append('image', fs.createReadStream(filePath));

const request = https.request({
  method: 'POST',
  host: 'api.imgbb.com',
  path: `/1/upload?key=${apiKey}`,
  headers: form.getHeaders()
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log(json);
    } catch (e) {
      console.error('Error parseando JSON:', e, data);
    }
  });
});

form.pipe(request);

request.on('error', err => console.error('Error request:', err));
