const fs = require('fs');
const path = require('path');
const https = require('https');
const pool = require('../db');

// ==========================
// Helpers de validación
// ==========================
const isNonEmptyString = (value) => {
  return typeof value === 'string' && value.trim().length > 0;
};

const isValidPhone = (telefono) => {
  if (!telefono) return false;
  const t = telefono.trim();
  // Acepta dígitos, espacios, +, -, paréntesis, longitud mínima 7
  const regex = /^[0-9+\-\s()]{7,}$/;
  return regex.test(t);
};

const parseLatLngOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = parseFloat(value);
  if (Number.isNaN(num)) return NaN; // para que podamos detectarlo
  return num;
};

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

    const request = https.request(
      {
        method: 'POST',
        host: 'api.imgbb.com',
        path: `/1/upload?key=${apiKey}`,
        headers: form.getHeaders(),
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.success) resolve(json.data.url);
            else reject(new Error(json.error?.message || 'Error subiendo imagen'));
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    request.on('error', (err) => reject(err));
    form.pipe(request);
  });
};

// ==========================
// Crear sitio (SIEMPRE Pendiente)
// ==========================
const createSite = async (req, res) => {
  try {
    console.log('req.body:', req.body);
    console.log('req.file:', req.file ? 'Archivo recibido' : 'NO HAY ARCHIVO');

    let {
      nombre,
      categoria,
      subcategorias,
      pet_friendly,
      kids_friendly,
      latitud,
      longitud,
      descripcion,
      direccion,
      telefono,
    } = req.body;

    const id_usuario = req.user.id;

    // Normalizar strings
    nombre = nombre?.trim();
    categoria = categoria?.trim();
    descripcion = descripcion?.trim();
    direccion = direccion?.trim();
    telefono = telefono?.trim();

    // Validaciones básicas
    if (!isNonEmptyString(nombre)) {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }
    if (!isNonEmptyString(categoria)) {
      return res.status(400).json({ error: 'La categoría es requerida' });
    }
    if (!subcategorias) {
      return res
        .status(400)
        .json({ error: 'Las subcategorías son requeridas' });
    }
    if (!isNonEmptyString(descripcion)) {
      return res.status(400).json({ error: 'La descripción es requerida' });
    }
    if (!isNonEmptyString(direccion)) {
      return res.status(400).json({ error: 'La dirección es requerida' });
    }
    if (!isNonEmptyString(telefono)) {
      return res.status(400).json({ error: 'El teléfono es requerido' });
    }
    if (!isValidPhone(telefono)) {
      return res.status(400).json({
        error:
          'El teléfono no tiene un formato válido (solo números, espacios, +, -, paréntesis)',
      });
    }

    let subcatsArray;
    try {
      subcatsArray = Array.isArray(subcategorias)
        ? subcategorias
        : JSON.parse(subcategorias);
    } catch (err) {
      return res
        .status(400)
        .json({ error: 'Subcategorías debe ser un array o string JSON válido' });
    }

    if (!Array.isArray(subcatsArray) || subcatsArray.length === 0) {
      return res
        .status(400)
        .json({ error: 'Debes enviar al menos una subcategoría' });
    }

    // Validar duplicado de sitio por nombre para el mismo usuario
    const dupQuery = await pool.query(
      'SELECT 1 FROM sitio WHERE LOWER(nombre) = LOWER($1) AND id_usuario = $2',
      [nombre, id_usuario]
    );
    if (dupQuery.rows.length > 0) {
      return res.status(400).json({
        error: 'Ya tienes un sitio registrado con ese nombre',
      });
    }

    // Validar lat/lon
    const lat = parseLatLngOrNull(latitud);
    const lon = parseLatLngOrNull(longitud);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return res.status(400).json({
        error: 'Latitud o longitud no tienen un formato numérico válido',
      });
    }

    let fotos = [];
    if (req.file) {
      console.log('Archivo recibido, subiendo a ImgBB...');
      const imageUrl = await uploadToImgbb(req.file.buffer, req.file.originalname);
      fotos.push(imageUrl);
    }

    const result = await pool.query(
      `INSERT INTO sitio 
      (nombre, categoria, subcategorias, fotos, pet_friendly, kids_friendly, latitud, longitud, descripcion, direccion, telefono, id_usuario, state)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Pendiente')
      RETURNING *`,
      [
        nombre,
        categoria,
        JSON.stringify(subcatsArray),
        JSON.stringify(fotos),
        pet_friendly === 'true' || pet_friendly === true,
        kids_friendly === 'true' || kids_friendly === true,
        lat,
        lon,
        descripcion,
        direccion,
        telefono,
        id_usuario,
      ]
    );

    res.json({
      message: 'Solicitud enviada. Pendiente de aprobación.',
      sitio: result.rows[0],
    });
  } catch (error) {
    console.error('Error en createSite:', error);
    res.status(500).json({ error: 'No se pudo crear el sitio' });
  }
};

// ==========================
// Obtener MIS sitios
// ==========================
const getMySites = async (req, res) => {
  try {
    const id_usuario = req.user.id;
    const result = await pool.query('SELECT * FROM sitio WHERE id_usuario = $1', [
      id_usuario,
    ]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error en getMySites:', error);
    res.status(500).json({ error: 'Error al obtener los sitios' });
  }
};

// ==========================
// Actualizar sitio
//  - Usuario normal: solo sus sitios
//  - Admin (rol = 'admin' o 'Administrador'): puede actualizar cualquier sitio
// ==========================
const updateSite = async (req, res) => {
  try {
    const { id } = req.params;
    let {
      nombre,
      categoria,
      subcategorias,
      fotos,
      pet_friendly,
      kids_friendly,
      latitud,
      longitud,
    } = req.body;

    const id_usuario = req.user.id;
    const rol = req.user.rol;

    const numericId = parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'ID de sitio inválido' });
    }

    let siteCheck;
    const isAdmin = rol === 'admin' || rol === 'Administrador';

    if (isAdmin) {
      siteCheck = await pool.query(
        'SELECT * FROM sitio WHERE id_sitio=$1',
        [numericId]
      );
    } else {
      siteCheck = await pool.query(
        'SELECT * FROM sitio WHERE id_sitio=$1 AND id_usuario=$2',
        [numericId, id_usuario]
      );
    }

    if (!siteCheck.rows.length) {
      return res
        .status(isAdmin ? 404 : 403)
        .json({ error: isAdmin ? 'Sitio no encontrado' : 'No tienes permiso para modificar este sitio' });
    }

    const currentSite = siteCheck.rows[0];

    // Normalizar strings básicos
    if (typeof nombre === 'string') nombre = nombre.trim();
    if (typeof categoria === 'string') categoria = categoria.trim();

    // Validar nombre/categoría si vienen
    const newNombre = nombre || currentSite.nombre;
    const newCategoria = categoria || currentSite.categoria;

    if (!isNonEmptyString(newNombre)) {
      return res
        .status(400)
        .json({ error: 'El nombre no puede quedar vacío' });
    }
    if (!isNonEmptyString(newCategoria)) {
      return res
        .status(400)
        .json({ error: 'La categoría no puede quedar vacía' });
    }

    // Subcategorías
    let subcatsArray = [];
    if (subcategorias) {
      try {
        subcatsArray = Array.isArray(subcategorias)
          ? subcategorias
          : JSON.parse(subcategorias);
      } catch (err) {
        return res.status(400).json({
          error: 'Subcategorías debe ser un array o string JSON válido',
        });
      }
      if (!Array.isArray(subcatsArray) || subcatsArray.length === 0) {
        return res
          .status(400)
          .json({ error: 'Debes enviar al menos una subcategoría' });
      }
    } else {
      // Mantener las actuales
      try {
        subcatsArray = JSON.parse(currentSite.subcategorias || '[]');
      } catch {
        subcatsArray = [];
      }
    }

    // Validar duplicado de nombre para el mismo usuario (o para el mismo dueño original)
    const ownerId = currentSite.id_usuario;
    const dup = await pool.query(
      'SELECT 1 FROM sitio WHERE LOWER(nombre) = LOWER($1) AND id_usuario = $2 AND id_sitio <> $3',
      [newNombre, ownerId, numericId]
    );
    if (dup.rows.length > 0) {
      return res.status(400).json({
        error: 'Ya existe otro sitio con ese nombre para este usuario',
      });
    }

    // ==========================
    // Fotos (normalizar JSON siempre)
    // ==========================
    let fotosArray = [];

    if (typeof fotos !== 'undefined') {
      // Viene algo desde el front
      if (Array.isArray(fotos)) {
        fotosArray = fotos;
      } else if (typeof fotos === 'string') {
        // Puede venir como JSON string o una URL suelta
        try {
          const parsed = JSON.parse(fotos);
          if (Array.isArray(parsed)) {
            fotosArray = parsed;
          } else {
            // No es array → tratamos la string como una URL única
            fotosArray = [fotos];
          }
        } catch {
          // No es JSON → asumimos que es una sola URL
          fotosArray = [fotos];
        }
      } else {
        // Cualquier otro tipo lo metemos en array para que sea JSON válido
        fotosArray = [fotos];
      }
    } else {
      // No mandaron fotos: usamos lo que ya hay, pero saneando
      if (Array.isArray(currentSite.fotos)) {
        fotosArray = currentSite.fotos;
      } else if (typeof currentSite.fotos === 'string' && currentSite.fotos.trim() !== '') {
        try {
          const parsed = JSON.parse(currentSite.fotos);
          if (Array.isArray(parsed)) {
            fotosArray = parsed;
          } else {
            // Si había algo raro como {"url"} lo ignoramos para no romper el JSON
            fotosArray = [];
          }
        } catch {
          // String inválida → la descartamos para no generar error 22P02
          fotosArray = [];
        }
      } else {
        fotosArray = [];
      }
    }

    const newFotos = JSON.stringify(fotosArray);

    // Booleans
    const pet =
      typeof pet_friendly !== 'undefined'
        ? pet_friendly === 'true' || pet_friendly === true
        : currentSite.pet_friendly;
    const kids =
      typeof kids_friendly !== 'undefined'
        ? kids_friendly === 'true' || kids_friendly === true
        : currentSite.kids_friendly;

    // Coordenadas
    const lat = typeof latitud !== 'undefined'
      ? parseLatLngOrNull(latitud)
      : currentSite.latitud;
    const lon = typeof longitud !== 'undefined'
      ? parseLatLngOrNull(longitud)
      : currentSite.longitud;

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return res.status(400).json({
        error: 'Latitud o longitud no tienen un formato numérico válido',
      });
    }

    const result = await pool.query(
      `UPDATE sitio SET nombre=$1, categoria=$2, subcategorias=$3, fotos=$4, pet_friendly=$5, kids_friendly=$6, latitud=$7, longitud=$8
       WHERE id_sitio=$9
       RETURNING *`,
      [newNombre, newCategoria, JSON.stringify(subcatsArray), newFotos, pet, kids, lat, lon, numericId]
    );

    res.json({ message: 'Sitio actualizado', sitio: result.rows[0] });
  } catch (error) {
    console.error('Error en updateSite:', error);
    res.status(500).json({ error: 'No se pudo actualizar el sitio' });
  }
};

// ==========================
// Eliminar sitio
//  - Usuario normal: solo sus sitios
//  - Admin: cualquier sitio
// ==========================
const deleteSite = async (req, res) => {
  try {
    const { id } = req.params;
    const id_usuario = req.user.id;
    const rol = req.user.rol;

    const numericId = parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'ID de sitio inválido' });
    }

    const isAdmin = rol === 'admin' || rol === 'Administrador';

    let siteCheck;
    if (isAdmin) {
      siteCheck = await pool.query(
        'SELECT * FROM sitio WHERE id_sitio=$1',
        [numericId]
      );
    } else {
      siteCheck = await pool.query(
        'SELECT * FROM sitio WHERE id_sitio=$1 AND id_usuario=$2',
        [numericId, id_usuario]
      );
    }

    if (!siteCheck.rows.length) {
      return res
        .status(isAdmin ? 404 : 403)
        .json({ error: isAdmin ? 'Sitio no encontrado' : 'No tienes permiso para eliminar este sitio' });
    }

    await pool.query('DELETE FROM sitio WHERE id_sitio=$1', [numericId]);
    res.json({ message: 'Sitio eliminado' });
  } catch (error) {
    console.error('Error en deleteSite:', error);
    res.status(500).json({ error: 'No se pudo eliminar el sitio' });
  }
};

// ==========================
// Subir imagen a sitio
//  - Usuario normal: solo sus sitios
//  - Admin: cualquier sitio
// ==========================
const uploadSiteImage = async (req, res) => {
  try {
    const { id } = req.params;
    const id_usuario = req.user.id;
    const rol = req.user.rol;

    const numericId = parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'ID de sitio inválido' });
    }

    const isAdmin = rol === 'admin' || rol === 'Administrador';

    let siteCheck;
    if (isAdmin) {
      siteCheck = await pool.query(
        'SELECT * FROM sitio WHERE id_sitio=$1',
        [numericId]
      );
    } else {
      siteCheck = await pool.query(
        'SELECT * FROM sitio WHERE id_sitio=$1 AND id_usuario=$2',
        [numericId, id_usuario]
      );
    }

    if (!siteCheck.rows.length) {
      return res
        .status(isAdmin ? 404 : 403)
        .json({ error: isAdmin ? 'Sitio no encontrado' : 'No tienes permiso para modificar este sitio' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ninguna imagen' });
    }

    const imageUrl = await uploadToImgbb(req.file.buffer, req.file.originalname);

    let existingFotos = [];
    try {
      existingFotos = siteCheck.rows[0].fotos
        ? JSON.parse(siteCheck.rows[0].fotos)
        : [];
      if (!Array.isArray(existingFotos)) {
        existingFotos = [];
      }
    } catch {
      existingFotos = [];
    }

    const updatedFotos = [...existingFotos, imageUrl];

    const result = await pool.query(
      'UPDATE sitio SET fotos=$1 WHERE id_sitio=$2 RETURNING *',
      [JSON.stringify(updatedFotos), numericId]
    );

    res.json({ message: 'Imagen subida con éxito', sitio: result.rows[0] });
  } catch (error) {
    console.error('Error en uploadSiteImage:', error);
    res.status(500).json({ error: 'Error al subir la imagen' });
  }
};

// ==========================
// Listar sitios públicos (SOLO Aprobados)
// ==========================
const getSites = async (req, res) => {
  try {
    const { categoria, pet_friendly, kids_friendly, q } = req.query;

    let baseQuery = `
      SELECT s.*, COALESCE(ar.avg_rating, 0)::float AS avg_rating, COALESCE(ar.reviews_count, 0) AS reviews_count
      FROM sitio s
      LEFT JOIN (
        SELECT id_sitio, AVG(calificacion) AS avg_rating, COUNT(id_resena) AS reviews_count
        FROM resenas
        GROUP BY id_sitio
      ) ar ON ar.id_sitio = s.id_sitio
    `;

    const where = [`s.state = 'Aprobada'`];
    const params = [];

    if (categoria) {
      params.push(categoria);
      where.push(`s.categoria = $${params.length}`);
    }

    if (typeof pet_friendly !== 'undefined') {
      const val = pet_friendly === 'true' || pet_friendly === '1';
      params.push(val);
      where.push(`s.pet_friendly = $${params.length}`);
    }

    if (typeof kids_friendly !== 'undefined') {
      const val = kids_friendly === 'true' || kids_friendly === '1';
      params.push(val);
      where.push(`s.kids_friendly = $${params.length}`);
    }

    if (q) {
      // limitar longitud de búsqueda para evitar cosas raras
      const queryText = String(q).slice(0, 100);
      params.push(`%${queryText}%`);
      where.push(
        `(s.nombre ILIKE $${params.length} OR s.categoria ILIKE $${params.length} OR s.subcategorias::text ILIKE $${params.length})`
      );
    }

    let finalQuery =
      baseQuery + ' WHERE ' + where.join(' AND ') + ' ORDER BY s.id_sitio DESC';

    const result = await pool.query(finalQuery, params);

    const rows = result.rows.map((r) => {
      const out = { ...r };
      try {
        out.subcategorias = JSON.parse(out.subcategorias);
      } catch {}
      try {
        out.fotos = JSON.parse(out.fotos);
      } catch {}
      out.latitud = out.latitud ? parseFloat(out.latitud) : null;
      out.longitud = out.longitud ? parseFloat(out.longitud) : null;
      return out;
    });

    res.json(rows);
  } catch (error) {
    console.error('Error en getSites:', error);
    res.status(500).json({ error: 'Error al listar sitios' });
  }
};

// ==========================
// Obtener sitio por ID (sin importar estado)
// ==========================
const getSiteById = async (req, res) => {
  try {
    const { id } = req.params;

    const numericId = parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'ID de sitio inválido' });
    }

    const query = `
      SELECT s.*, COALESCE(ar.avg_rating, 0)::float AS avg_rating, COALESCE(ar.reviews_count, 0) AS reviews_count
      FROM sitio s
      LEFT JOIN (
        SELECT id_sitio, AVG(calificacion) AS avg_rating, COUNT(id_resena) AS reviews_count
        FROM resenas
        GROUP BY id_sitio
      ) ar ON ar.id_sitio = s.id_sitio
      WHERE s.id_sitio = $1
    `;

    const result = await pool.query(query, [numericId]);
    if (!result.rows.length) {
      return res.status(404).json({ message: 'Sitio no encontrado' });
    }

    const row = result.rows[0];
    try {
      row.subcategorias = JSON.parse(row.subcategorias);
    } catch {}
    try {
      row.fotos = JSON.parse(row.fotos);
    } catch {}
    row.latitud = row.latitud ? parseFloat(row.latitud) : null;
    row.longitud = row.longitud ? parseFloat(row.longitud) : null;

    res.json(row);
  } catch (error) {
    console.error('Error en getSiteById:', error);
    res.status(500).json({ error: 'Error al obtener sitio' });
  }
};

// ==========================
// Admin: Listar solicitudes
// ==========================
const getPendingSites = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM sitio
      ORDER BY 
        CASE 
          WHEN state = 'Pendiente' THEN 1
          WHEN state = 'Aprobada' THEN 2
          WHEN state = 'Rechazada' THEN 3
          ELSE 4
        END,
        id_sitio DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error en getPendingSites:', error);
    res.status(500).json({ error: 'Error al obtener solicitudes' });
  }
};

// ==========================
// Admin: Aprobar o rechazar
// ==========================
const updateSiteState = async (req, res) => {
  try {
    const { id } = req.params;
    const { state } = req.body;

    const numericId = parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'ID de sitio inválido' });
    }

    if (!['Aprobada', 'Rechazada'].includes(state)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const result = await pool.query(
      'UPDATE sitio SET state = $1 WHERE id_sitio = $2 RETURNING *',
      [state, numericId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Sitio no encontrado' });
    }

    res.json({
      message: `Sitio ${state.toLowerCase()}`,
      sitio: result.rows[0],
    });
  } catch (error) {
    console.error('Error en updateSiteState:', error);
    res.status(500).json({ error: 'No se pudo actualizar el estado' });
  }
};

module.exports = {
  createSite,
  getMySites,
  updateSite,
  deleteSite,
  uploadSiteImage,
  getSites,
  getSiteById,
  getPendingSites,
  updateSiteState,
};
