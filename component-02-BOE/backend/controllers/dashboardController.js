const { getModuleReviewStatus } = require("../services/moduleAccessService");

// GET BOE DASHBOARD
exports.getDashboard = async (req, res) => {
  try {
    const assignedModules = req.user.assignedModules || [];

    const modules = await Promise.all(
      assignedModules.map(async (moduleCode) => {
        return await getModuleReviewStatus(moduleCode);
      }),
    );

    res.json({
      username: req.user.username,

      role: req.user.role,

      assignedModules: modules,
    });
  } catch (error) {
    console.error("❌ Dashboard error:", error);

    res.status(500).json({
      message: "Server Error",
    });
  }
};