const express = require('express');
const router = express.Router();
const siteController = require('../controllers/sitesController');
const authenticateToken = require('../middleware/authenticateToken');
const upload = require('../middleware/upload');

router.post('/', authenticateToken, upload.single('imagen'), siteController.createSite);
router.get('/my-sites', authenticateToken, siteController.getMySites);
router.put('/:id', authenticateToken, siteController.updateSite);
router.delete('/:id', authenticateToken, siteController.deleteSite);


router.post('/:id/upload', authenticateToken, upload.single('imagen'), siteController.uploadSiteImage);

module.exports = router;
