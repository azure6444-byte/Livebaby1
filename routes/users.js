const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.post('/save', async (req, res) => {
  try {
    const { name, email, photoUrl, googleId, deviceInfo } = req.body;

    if (!email || !googleId) return res.status(400).json({ success: false, message: 'Email and Google ID required' });

    let user = await User.findOne({ googleId });

    if (!user) {
      user = new User({ name, email, photoUrl, googleId, deviceInfo });
      await user.save();
      return res.status(201).json({ success: true, message: 'User created', user });
    }

    return res.status(200).json({ success: true, message: 'User already exists', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

module.exports = router;
