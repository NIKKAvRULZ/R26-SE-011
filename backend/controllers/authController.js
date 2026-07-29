const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const BOAUser = require("../models/BOAUser");

exports.login = async (req, res) => {

  try {

    const { username, password } = req.body;

    if (!username || !password) {

      return res.status(400).json({
        message: "Username and password are required",
      });

    }

    const user = await BOAUser.findOne({ username });

    if (!user) {

      return res.status(401).json({
        message: "Invalid username or password",
      });

    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {

      return res.status(401).json({
        message: "Invalid username or password",
      });

    }

    const token = jwt.sign(

      {
        id: user._id,
        username: user.username,
        role: user.role,
        assignedModules: user.assignedModules,
      },

      process.env.JWT_SECRET,

      {
        expiresIn: "8h",
      }

    );

    res.json({

      message: "Login successful",

      token,

      user: {

        username: user.username,

        role: user.role,

        assignedModules: user.assignedModules,

      },

    });

  }

  catch (error) {

    console.log(error);

    res.status(500).json({

      message: "Server Error",

    });

  }

};