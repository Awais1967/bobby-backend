require("dotenv").config();

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const Admin = require("../modules/admins/admin.model");

async function seedSuperAdmin() {
  const { SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD } = process.env;

  if (!SUPER_ADMIN_NAME || !SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
    throw new Error(
      "SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD are required"
    );
  }

  await connectDB();

  const email = SUPER_ADMIN_EMAIL.toLowerCase();
  const existingAdmin = await Admin.findOne({ email });

  if (existingAdmin) {
    console.log(`Super Admin already exists: ${email}`);
    return;
  }

  await Admin.create({
    name: SUPER_ADMIN_NAME,
    email,
    password: SUPER_ADMIN_PASSWORD,
  });

  console.log(`Super Admin created: ${email}`);
}

seedSuperAdmin()
  .catch((error) => {
    console.error("Failed to seed Super Admin:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
