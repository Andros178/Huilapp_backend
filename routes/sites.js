const express = require('express');
const router = express.Router();
const siteController = require('../controllers/sitesController');
const authenticateToken = require('../middleware/authenticateToken');
const upload = require('../middleware/upload');

router.post('/', authenticateToken, upload.single('imagen'), siteController.createSite);
router.get('/', siteController.getSites);
router.get('/my-sites', authenticateToken, siteController.getMySites);

router.get('/pendientes', authenticateToken, (req, res, next) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Acceso denegado' });
  next();
}, siteController.getPendingSites);

router.put('/:id/state', authenticateToken, (req, res, next) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Acceso denegado' });
  next();
}, siteController.updateSiteState);

router.get('/:id', siteController.getSiteById);
router.put('/:id', authenticateToken, siteController.updateSite);
router.delete('/:id', authenticateToken, siteController.deleteSite);
router.post('/:id/upload', authenticateToken, upload.single('imagen'), siteController.uploadSiteImage);

module.exports = router;
