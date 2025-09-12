const fs = require('fs');
const path = require('path');
const https = require('https');
const pool = require('../db');


// ==========================
// Función para subir a ImgBB desde buffer
// ==========================
const uploadToImgbb = (fileBuffer, filename) => {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const FormData = require('form-data');
    const apiKey = process.env.IMGBB_API_KEY;

    const form = new FormData();
    form.append('image', fileBuffer, { filename });

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
          if (json.success) resolve(json.data.url);
          else reject(new Error(json.error?.message || 'Error subiendo imagen'));
        } catch (e) {
          reject(e);
        }
      });
    });

    request.on('error', err => reject(err));
    form.pipe(request);
  });
};

// ==========================
// Crear sitio
// ==========================
const createSite = async (req, res) => {
  try {
    console.log('req.body:', req.body);
    console.log('req.file:', req.file ? 'Archivo recibido' : 'NO HAY ARCHIVO');

    const { nombre, categoria, subcategorias, pet_friendly, kids_friendly } = req.body;
    const id_usuario = req.user.id;

    if (!nombre || !categoria || !subcategorias) {
      return res.status(400).json({ error: 'Nombre, categoría y subcategorías son requeridos' });
    }

    let subcatsArray;
    try {
      subcatsArray = Array.isArray(subcategorias) ? subcategorias : JSON.parse(subcategorias);
    } catch (err) {
      return res.status(400).json({ error: 'Subcategorías debe ser un array o string JSON' });
    }

    let fotos = [];
    if (req.file) {
      console.log('Archivo recibido, subiendo a ImgBB...');
      const imageUrl = await uploadToImgbb(req.file.buffer, req.file.originalname);
      fotos.push(imageUrl);
    }
    else {
      console.log('No se recibió archivo, creando sitio sin imagen.');
    }

    const result = await pool.query(
      `INSERT INTO sitio 
       (nombre, categoria, subcategorias, fotos, pet_friendly, kids_friendly, id_usuario)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        nombre,
        categoria,
        JSON.stringify(subcatsArray),
        JSON.stringify(fotos),
        pet_friendly === 'true' || pet_friendly === true,
        kids_friendly === 'true' || kids_friendly === true,
        id_usuario
      ]
    );

    console.log('Sitio creado en DB:', result.rows[0]);
    res.json({ message: 'Sitio creado', sitio: result.rows[0] });
  } catch (error) {
    console.error('Error en createSite:', error);
    res.status(500).json({ error: 'No se pudo crear el sitio' });
  }
};



// ==========================
// Obtener mis sitios
// ==========================
const getMySites = async (req, res) => {
  try {
    const id_usuario = req.user.id;
    const result = await pool.query('SELECT * FROM sitio WHERE id_usuario = $1', [id_usuario]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error en getMySites:', error);
    res.status(500).json({ error: 'Error al obtener los sitios' });
  }
};

// ==========================
// Actualizar sitio
// ==========================
const updateSite = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, categoria, subcategorias, fotos, pet_friendly, kids_friendly } = req.body;
    const id_usuario = req.user.id;

    const siteCheck = await pool.query('SELECT * FROM sitio WHERE id_sitio=$1 AND id_usuario=$2', [id, id_usuario]);
    if (!siteCheck.rows.length) return res.status(403).json({ error: 'No tienes permiso para modificar este sitio' });

    let subcatsArray = [];
    if (subcategorias) {
      try {
        subcatsArray = Array.isArray(subcategorias) ? subcategorias : JSON.parse(subcategorias);
      } catch (err) {
        return res.status(400).json({ error: 'Subcategorías debe ser un array o string JSON' });
      }
    }

    const result = await pool.query(
      `UPDATE sitio SET nombre=$1, categoria=$2, subcategorias=$3, fotos=$4, pet_friendly=$5, kids_friendly=$6
       WHERE id_sitio=$7
       RETURNING *`,
      [
        nombre,
        categoria,
        JSON.stringify(subcatsArray),
        fotos ? JSON.stringify(fotos) : siteCheck.rows[0].fotos || '[]',
        pet_friendly || false,
        kids_friendly || false,
        id
      ]
    );

    res.json({ message: 'Sitio actualizado', sitio: result.rows[0] });
  } catch (error) {
    console.error('Error en updateSite:', error);
    res.status(500).json({ error: 'No se pudo actualizar el sitio' });
  }
};

// ==========================
// Eliminar sitio
// ==========================
const deleteSite = async (req, res) => {
  try {
    const { id } = req.params;
    const id_usuario = req.user.id;

    const siteCheck = await pool.query('SELECT * FROM sitio WHERE id_sitio=$1 AND id_usuario=$2', [id, id_usuario]);
    if (!siteCheck.rows.length) return res.status(403).json({ error: 'No tienes permiso para eliminar este sitio' });

    await pool.query('DELETE FROM sitio WHERE id_sitio=$1', [id]);
    res.json({ message: 'Sitio eliminado' });
  } catch (error) {
    console.error('Error en deleteSite:', error);
    res.status(500).json({ error: 'No se pudo eliminar el sitio' });
  }
};

// ==========================
// Subir imagen a sitio
// ==========================
const uploadSiteImage = async (req, res) => {
  try {
    const { id } = req.params;
    const id_usuario = req.user.id;

    const siteCheck = await pool.query('SELECT * FROM sitio WHERE id_sitio=$1 AND id_usuario=$2', [id, id_usuario]);
    if (!siteCheck.rows.length) return res.status(403).json({ error: 'No tienes permiso para modificar este sitio' });
    if (!req.file) return res.status(400).json({ error: 'No se subió ninguna imagen' });

    console.log('Subiendo imagen a ImgBB...');
    const imageUrl = await uploadToImgbb(req.file.buffer);
    console.log('Imagen subida con éxito:', imageUrl);

    const existingFotos = siteCheck.rows[0].fotos || [];
    const updatedFotos = [...existingFotos, imageUrl];

    const result = await pool.query(
      'UPDATE sitio SET fotos=$1 WHERE id_sitio=$2 RETURNING *',
      [JSON.stringify(updatedFotos), id]
    );

    res.json({ message: 'Imagen subida con éxito', sitio: result.rows[0] });
  } catch (error) {
    console.error('Error en uploadSiteImage:', error);
    res.status(500).json({ error: 'Error al subir la imagen' });
  }
};

module.exports = {
  createSite,
  getMySites,
  updateSite,
  deleteSite,
  uploadSiteImage
};
