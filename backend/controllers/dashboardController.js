exports.getDashboard = async (req, res) => {
  try {
    res.json({
      username: req.user.username,

      role: req.user.role,

      assignedModules: req.user.assignedModules,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
};
