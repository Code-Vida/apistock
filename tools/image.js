const axios = require('axios');
const sharp = require('sharp');
const path = require('path');
const FormData = require('form-data');


// eslint-disable-next-line no-undef
const imagePath = path.join(__dirname, 'imgteste.jpeg');
console.log('🔍 Caminho da imagem:', imagePath);


sharp(imagePath)
    .resize({ width: 250 }) 
    .jpeg({ quality: 70 })  
    .toBuffer()
    .then(async (data) => {
        const base64 = data.toString('base64');

        const form = new FormData();
        form.append('file', base64); 
        form.append('fileName', 'produto6.jpg');

        try {
            const response = await axios.post(
                'https://upload.imagekit.io/api/v1/files/upload',
                form,
                {
                    auth: {
                        username: 'private_ugyasb2W7giERMMbKAqAkHi0kgc=', 
                        password: '',                     
                    },
                    headers: form.getHeaders(),
                }
            );

            console.log('✅ URL da imagem:', response.data.url);
        } catch (err) {
            console.error('❌ Erro no upload:', err.response?.data || err.message);
        }
    })
    .catch((err) => {
        console.error('❌ Erro no processamento da imagem:', err);
    });
