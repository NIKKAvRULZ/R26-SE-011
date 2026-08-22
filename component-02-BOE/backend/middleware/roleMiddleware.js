exports.authorizeBOA = (req, res, next) => {

    if (req.user.role !== "BOA") {

        return res.status(403).json({

            message: "Access denied."

        });

    }

    next();

};