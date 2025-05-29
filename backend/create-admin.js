const bcrypt = require("bcrypt")
const mysql = require("mysql2/promise")
require("dotenv").config()

async function createAdmin() {
  const dbConfig = {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "szavazza_go",
  }

  try {
    const connection = await mysql.createConnection(dbConfig)

    // Hash the password
    const hashedPassword = await bcrypt.hash("admin123", 10)

    // Delete existing admin user if exists
    await connection.execute("DELETE FROM users WHERE username = 'admin'")

    // Insert new admin user
    await connection.execute(
      `
      INSERT INTO users (username, email, password_hash, is_admin)
      VALUES (?, ?, ?, ?)
    `,
      ["admin", "admin@test.com", hashedPassword, true],
    )

    console.log("✅ Admin user created successfully!")
    console.log("Username: admin")
    console.log("Password: admin123")

    await connection.end()
  } catch (error) {
    console.error("❌ Error creating admin user:", error)
  }
}

createAdmin()
