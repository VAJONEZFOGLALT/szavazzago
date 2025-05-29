const mysql = require("mysql2/promise")
const bcrypt = require("bcrypt")
require("dotenv").config()

class SystemDebugger {
  constructor() {
    this.results = {
      database: {},
      backend: {},
      frontend: {},
      auth: {},
      api: {},
      overall: "UNKNOWN",
    }

    this.dbConfig = {
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "szavazza_go",
    }
  }

  log(category, test, status, message, details = null) {
    const timestamp = new Date().toISOString()
    const statusIcon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️"

    console.log(`[${timestamp}] ${statusIcon} ${category.toUpperCase()}: ${test} - ${status}`)
    console.log(`   ${message}`)
    if (details) {
      console.log(`   Details:`, details)
    }
    console.log("")

    if (!this.results[category]) this.results[category] = {}
    this.results[category][test] = { status, message, details, timestamp }
  }

  async testDatabaseConnection() {
    console.log("🔍 TESTING DATABASE CONNECTION...\n")

    try {
      const connection = await mysql.createConnection(this.dbConfig)
      this.log("database", "connection", "PASS", "Successfully connected to MySQL database")

      // Test basic query
      const [rows] = await connection.execute("SELECT 1 + 1 AS result")
      this.log("database", "basic_query", "PASS", "Basic SQL query executed successfully", { result: rows[0].result })

      await connection.end()
      return true
    } catch (error) {
      this.log("database", "connection", "FAIL", "Failed to connect to MySQL database", {
        error: error.message,
        config: { ...this.dbConfig, password: "***" },
      })
      return false
    }
  }

  async testDatabaseTables() {
    console.log("🔍 TESTING DATABASE TABLES...\n")

    try {
      const connection = await mysql.createConnection(this.dbConfig)

      // Check if all required tables exist
      const requiredTables = ["users", "questions", "answers", "tags", "question_tags", "votes", "question_reactions"]
      const [tables] = await connection.execute("SHOW TABLES")
      const existingTables = tables.map((row) => Object.values(row)[0])

      for (const table of requiredTables) {
        if (existingTables.includes(table)) {
          this.log("database", `table_${table}`, "PASS", `Table '${table}' exists`)
        } else {
          this.log("database", `table_${table}`, "FAIL", `Table '${table}' is missing`)
        }
      }

      // Check table structures
      for (const table of existingTables) {
        const [columns] = await connection.execute(`DESCRIBE ${table}`)
        this.log("database", `structure_${table}`, "PASS", `Table '${table}' structure verified`, {
          columns: columns.map((col) => `${col.Field} (${col.Type})`),
        })
      }

      await connection.end()
      return true
    } catch (error) {
      this.log("database", "tables", "FAIL", "Failed to check database tables", { error: error.message })
      return false
    }
  }

  async testDatabaseData() {
    console.log("🔍 TESTING DATABASE DATA...\n")

    try {
      const connection = await mysql.createConnection(this.dbConfig)

      // Check users
      const [users] = await connection.execute("SELECT COUNT(*) as count FROM users")
      this.log("database", "users_count", "INFO", `Found ${users[0].count} users in database`)

      if (users[0].count > 0) {
        const [userList] = await connection.execute("SELECT id, username, email, is_admin FROM users")
        this.log("database", "users_list", "INFO", "User list", { users: userList })
      }

      // Check questions
      const [questions] = await connection.execute("SELECT COUNT(*) as count FROM questions WHERE is_active = TRUE")
      this.log("database", "questions_count", "INFO", `Found ${questions[0].count} active questions in database`)

      if (questions[0].count > 0) {
        const [questionList] = await connection.execute(
          "SELECT id, text, author_id, created_at FROM questions WHERE is_active = TRUE LIMIT 5",
        )
        this.log("database", "questions_list", "INFO", "Recent questions", { questions: questionList })
      }

      // Check tags
      const [tags] = await connection.execute("SELECT COUNT(*) as count FROM tags")
      this.log("database", "tags_count", "INFO", `Found ${tags[0].count} tags in database`)

      if (tags[0].count > 0) {
        const [tagList] = await connection.execute("SELECT name FROM tags")
        this.log("database", "tags_list", "INFO", "Available tags", { tags: tagList.map((t) => t.name) })
      }

      await connection.end()
      return true
    } catch (error) {
      this.log("database", "data", "FAIL", "Failed to check database data", { error: error.message })
      return false
    }
  }

  async testAPIEndpoints() {
    console.log("🔍 TESTING API ENDPOINTS...\n")

    const baseURL = `http://localhost:${process.env.PORT || 3000}/api`

    try {
      // Test basic endpoints
      const endpoints = [
        { path: "/test", method: "GET", description: "Basic API test" },
        { path: "/db-test", method: "GET", description: "Database connection test" },
        { path: "/questions", method: "GET", description: "Get all questions" },
        { path: "/tags", method: "GET", description: "Get all tags" },
      ]

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(`${baseURL}${endpoint.path}`)
          const data = await response.json()

          if (response.ok) {
            this.log(
              "api",
              `endpoint_${endpoint.path.replace("/", "")}`,
              "PASS",
              `${endpoint.description} - Status: ${response.status}`,
              { data },
            )
          } else {
            this.log(
              "api",
              `endpoint_${endpoint.path.replace("/", "")}`,
              "FAIL",
              `${endpoint.description} - Status: ${response.status}`,
              { error: data },
            )
          }
        } catch (error) {
          this.log(
            "api",
            `endpoint_${endpoint.path.replace("/", "")}`,
            "FAIL",
            `${endpoint.description} - Network error`,
            { error: error.message },
          )
        }
      }

      return true
    } catch (error) {
      this.log("api", "endpoints", "FAIL", "Failed to test API endpoints", { error: error.message })
      return false
    }
  }

  async testAuthSystem() {
    console.log("🔍 TESTING AUTHENTICATION SYSTEM...\n")

    try {
      const connection = await mysql.createConnection(this.dbConfig)

      // Check if admin user exists
      const [adminUsers] = await connection.execute("SELECT * FROM users WHERE is_admin = TRUE")

      if (adminUsers.length > 0) {
        this.log("auth", "admin_exists", "PASS", `Found ${adminUsers.length} admin user(s)`, {
          admins: adminUsers.map((u) => ({ id: u.id, username: u.username, email: u.email })),
        })

        // Test password verification for first admin
        const admin = adminUsers[0]
        try {
          const testPassword = "admin123"
          const isValid = await bcrypt.compare(testPassword, admin.password_hash)

          if (isValid) {
            this.log(
              "auth",
              "admin_password",
              "PASS",
              `Admin password verification works (tested with '${testPassword}')`,
            )
          } else {
            this.log("auth", "admin_password", "WARN", `Admin password '${testPassword}' doesn't match stored hash`)
          }
        } catch (error) {
          this.log("auth", "admin_password", "FAIL", "Password verification failed", { error: error.message })
        }
      } else {
        this.log("auth", "admin_exists", "FAIL", "No admin users found in database")

        // Create admin user
        try {
          const hashedPassword = await bcrypt.hash("admin123", 10)
          await connection.execute("INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, ?)", [
            "admin",
            "admin@test.com",
            hashedPassword,
            true,
          ])
          this.log("auth", "admin_created", "PASS", "Created admin user (username: admin, password: admin123)")
        } catch (error) {
          this.log("auth", "admin_created", "FAIL", "Failed to create admin user", { error: error.message })
        }
      }

      await connection.end()
      return true
    } catch (error) {
      this.log("auth", "system", "FAIL", "Failed to test authentication system", { error: error.message })
      return false
    }
  }

  checkEnvironmentVariables() {
    console.log("🔍 CHECKING ENVIRONMENT VARIABLES...\n")

    const requiredVars = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME", "JWT_SECRET"]
    const optionalVars = ["PORT"]

    for (const varName of requiredVars) {
      if (process.env[varName]) {
        this.log("backend", `env_${varName.toLowerCase()}`, "PASS", `Environment variable ${varName} is set`, {
          value: varName.includes("PASSWORD") || varName.includes("SECRET") ? "***" : process.env[varName],
        })
      } else {
        this.log("backend", `env_${varName.toLowerCase()}`, "FAIL", `Environment variable ${varName} is missing`)
      }
    }

    for (const varName of optionalVars) {
      if (process.env[varName]) {
        this.log("backend", `env_${varName.toLowerCase()}`, "INFO", `Optional environment variable ${varName} is set`, {
          value: process.env[varName],
        })
      } else {
        this.log(
          "backend",
          `env_${varName.toLowerCase()}`,
          "INFO",
          `Optional environment variable ${varName} is not set (using default)`,
        )
      }
    }
  }

  checkFileStructure() {
    console.log("🔍 CHECKING FILE STRUCTURE...\n")

    const fs = require("fs")
    const path = require("path")

    const requiredFiles = [
      { path: "package.json", type: "backend" },
      { path: ".env", type: "backend" },
      { path: "server.js", type: "backend" },
      { path: "../frontend/index.html", type: "frontend" },
      { path: "../frontend/src/main.js", type: "frontend" },
      { path: "../frontend/src/auth.js", type: "frontend" },
      { path: "../frontend/src/login-handler.js", type: "frontend" },
    ]

    for (const file of requiredFiles) {
      try {
        const fullPath = path.resolve(__dirname, file.path)
        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath)
          this.log("backend", `file_${file.path.replace(/[^a-zA-Z0-9]/g, "_")}`, "PASS", `File ${file.path} exists`, {
            size: `${Math.round((stats.size / 1024) * 100) / 100} KB`,
            modified: stats.mtime.toISOString(),
          })
        } else {
          this.log("backend", `file_${file.path.replace(/[^a-zA-Z0-9]/g, "_")}`, "FAIL", `File ${file.path} is missing`)
        }
      } catch (error) {
        this.log(
          "backend",
          `file_${file.path.replace(/[^a-zA-Z0-9]/g, "_")}`,
          "FAIL",
          `Error checking file ${file.path}`,
          { error: error.message },
        )
      }
    }
  }

  generateSummaryReport() {
    console.log("\n" + "=".repeat(80))
    console.log("📊 DIAGNOSTIC SUMMARY REPORT")
    console.log("=".repeat(80) + "\n")

    const categories = Object.keys(this.results)
    let totalTests = 0
    let passedTests = 0
    let failedTests = 0
    let warnTests = 0

    for (const category of categories) {
      if (category === "overall") continue

      const tests = Object.keys(this.results[category])
      const categoryPassed = tests.filter((test) => this.results[category][test].status === "PASS").length
      const categoryFailed = tests.filter((test) => this.results[category][test].status === "FAIL").length
      const categoryWarn = tests.filter((test) => this.results[category][test].status === "WARN").length

      totalTests += tests.length
      passedTests += categoryPassed
      failedTests += categoryFailed
      warnTests += categoryWarn

      const categoryStatus = categoryFailed > 0 ? "❌" : categoryWarn > 0 ? "⚠️" : "✅"

      console.log(`${categoryStatus} ${category.toUpperCase()}: ${categoryPassed}/${tests.length} tests passed`)

      if (categoryFailed > 0) {
        console.log(`   Failed tests:`)
        tests.forEach((test) => {
          if (this.results[category][test].status === "FAIL") {
            console.log(`   - ${test}: ${this.results[category][test].message}`)
          }
        })
      }

      if (categoryWarn > 0) {
        console.log(`   Warnings:`)
        tests.forEach((test) => {
          if (this.results[category][test].status === "WARN") {
            console.log(`   - ${test}: ${this.results[category][test].message}`)
          }
        })
      }

      console.log("")
    }

    // Overall status
    let overallStatus
    if (failedTests === 0 && warnTests === 0) {
      overallStatus = "🎉 ALL SYSTEMS OPERATIONAL"
    } else if (failedTests === 0) {
      overallStatus = "⚠️ SYSTEM OPERATIONAL WITH WARNINGS"
    } else if (failedTests < totalTests / 2) {
      overallStatus = "🔧 SYSTEM NEEDS MINOR FIXES"
    } else {
      overallStatus = "🚨 SYSTEM NEEDS MAJOR FIXES"
    }

    console.log("=".repeat(80))
    console.log(`OVERALL STATUS: ${overallStatus}`)
    console.log(`TOTAL: ${passedTests}/${totalTests} tests passed, ${failedTests} failed, ${warnTests} warnings`)
    console.log("=".repeat(80) + "\n")

    // Recommendations
    if (failedTests > 0) {
      console.log("🔧 RECOMMENDED ACTIONS:")

      if (this.results.database && Object.values(this.results.database).some((test) => test.status === "FAIL")) {
        console.log("1. Fix database connection and table structure issues")
      }

      if (this.results.auth && Object.values(this.results.auth).some((test) => test.status === "FAIL")) {
        console.log("2. Set up admin user and fix authentication system")
      }

      if (this.results.backend && Object.values(this.results.backend).some((test) => test.status === "FAIL")) {
        console.log("3. Check environment variables and file structure")
      }

      if (this.results.api && Object.values(this.results.api).some((test) => test.status === "FAIL")) {
        console.log("4. Debug API endpoints and server connectivity")
      }

      console.log("")
    }

    this.results.overall = overallStatus
  }

  async runFullDiagnostic() {
    console.log("🚀 STARTING FULL SYSTEM DIAGNOSTIC...\n")
    console.log("This will test all components of your Szavazza GO application.\n")

    // Environment and file checks
    this.checkEnvironmentVariables()
    this.checkFileStructure()

    // Database tests
    const dbConnected = await this.testDatabaseConnection()
    if (dbConnected) {
      await this.testDatabaseTables()
      await this.testDatabaseData()
    }

    // Auth tests
    if (dbConnected) {
      await this.testAuthSystem()
    }

    // API tests (with delay to ensure server is ready)
    setTimeout(async () => {
      await this.testAPIEndpoints()
      this.generateSummaryReport()
    }, 2000)
  }
}

module.exports = SystemDebugger
