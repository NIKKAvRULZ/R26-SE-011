const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const BOAUser = require("../models/BOAUser");

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {

    console.log("MongoDB Connected");

    await BOAUser.deleteMany();

    const users = [

      {
        username: "boeA",
        password: await bcrypt.hash("password123", 10),
        assignedModules: ["SE3040"],
      },

      {
        username: "boeB",
        password: await bcrypt.hash("password123", 10),
        assignedModules: ["SE3050"],
      },

      {
        username: "boeC",
        password: await bcrypt.hash("password123", 10),
        assignedModules: ["SE3060"],
      },

    ];

    await BOAUser.insertMany(users);

    console.log("BOA Users Seeded");

    process.exit();

  })
  .catch((err) => console.log(err));