const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = 3000;
const JWT_SECRET = 'supersecret';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Move getAnswersAndVotes to top-level scope
const getAnswersAndVotes = (questionId) => {
    return new Promise((resolve, reject) => {
        pool.query(`
            SELECT 
                a.id,
                a.text,
                COUNT(v.id) as votes
            FROM answers a
            LEFT JOIN votes v ON a.id = v.answer_id
            WHERE a.question_id = $1
            GROUP BY a.id
        `, [questionId], (err, result) => {
            if (err) reject(err);
            else resolve(result.rows.map(row => ({
                id: row.id,
                text: row.text,
                votes: row.votes
            })));
        });
    });
};

async function createTables() {
  // Users
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Questions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Answers
  await pool.query(`
    CREATE TABLE IF NOT EXISTS answers (
      id SERIAL PRIMARY KEY,
      question_id INTEGER REFERENCES questions(id),
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Votes
  await pool.query(`
    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      question_id INTEGER REFERENCES questions(id),
      answer_id INTEGER REFERENCES answers(id),
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Question reactions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS question_reactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      question_id INTEGER REFERENCES questions(id),
      reaction TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('PostgreSQL tables ensured');
}

createTables().catch(err => {
  console.error('Error creating tables:', err);
  process.exit(1);
});

// Auth middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

// Register
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    const hash = bcrypt.hashSync(password, 10);
    pool.query('INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id', [username, hash], (err, result) => {
        if (err) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        const user = { id: result.rows[0].id, username };
        const token = jwt.sign(user, JWT_SECRET);
        res.json({ token, user });
    });
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    pool.query('SELECT * FROM users WHERE username = $1', [username], (err, result) => {
        if (err || result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const user = result.rows[0];
        if (!bcrypt.compareSync(password, user.password)) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
        res.json({ token, user: { id: user.id, username: user.username } });
    });
});

// Get all questions
app.get('/api/questions', (req, res) => {
    // First get all questions with like/dislike counts
    pool.query(`
        SELECT 
            q.id,
            q.text,
            q.created_at,
            u.username as author,
            COALESCE(qr.likes, 0) as likes,
            COALESCE(qr.dislikes, 0) as dislikes
        FROM questions q
        LEFT JOIN users u ON q.user_id = u.id
        LEFT JOIN (
            SELECT question_id, 
                   SUM(CASE WHEN reaction = 'like' THEN 1 ELSE 0 END) as likes,
                   SUM(CASE WHEN reaction = 'dislike' THEN 1 ELSE 0 END) as dislikes
            FROM question_reactions
            GROUP BY question_id
        ) qr ON qr.question_id = q.id
        ORDER BY q.created_at DESC
    `, [], (err, result) => {
        if (err) {
            console.error('Error fetching questions:', err);
            res.status(500).json({ error: 'Failed to fetch questions' });
            return;
        }

        // Use top-level getAnswersAndVotes
        Promise.all(result.rows.map(async (question) => {
            const answers = await getAnswersAndVotes(question.id);
            return {
                ...question,
                answers: answers
            };
        }))
        .then(questionsWithAnswers => {
            res.json(questionsWithAnswers);
        })
        .catch(err => {
            console.error('Error processing questions:', err);
            res.status(500).json({ error: 'Failed to process questions' });
        });
    });
});

// Get user questions
app.get('/api/questions/user', authenticateToken, (req, res) => {
    pool.query(`
        SELECT 
            q.id,
            q.text,
            q.created_at,
            u.username as author,
            COALESCE(vq.votes, 0) as votes,
            COALESCE(qr.likes, 0) as likes,
            COALESCE(qr.dislikes, 0) as dislikes
        FROM questions q
        LEFT JOIN users u ON q.user_id = u.id
        LEFT JOIN (
            SELECT q.id as qid, COUNT(v.id) as votes
            FROM questions q
            LEFT JOIN answers a ON a.question_id = q.id
            LEFT JOIN votes v ON v.answer_id = a.id
            GROUP BY q.id
        ) vq ON vq.qid = q.id
        LEFT JOIN (
            SELECT question_id, 
                   SUM(CASE WHEN reaction = 'like' THEN 1 ELSE 0 END) as likes,
                   SUM(CASE WHEN reaction = 'dislike' THEN 1 ELSE 0 END) as dislikes
            FROM question_reactions
            GROUP BY question_id
        ) qr ON qr.question_id = q.id
        WHERE q.user_id = $1
        ORDER BY q.created_at DESC
    `, [req.user.id], async (err, result) => {
        if (err) {
            console.error('Error fetching user questions:', err);
            res.status(500).json({ error: 'Failed to fetch user questions' });
            return;
        }

        // Get answers for each question
        try {
            const questionsWithAnswers = await Promise.all(result.rows.map(async (question) => {
                const answers = await getAnswersAndVotes(question.id);
                return {
                    ...question,
                    answers
                };
            }));
            res.json(questionsWithAnswers);
        } catch (err) {
            console.error('Error fetching answers:', err);
            res.status(500).json({ error: 'Failed to fetch answers' });
        }
    });
});

// Create question
app.post('/api/questions', authenticateToken, (req, res) => {
    const { text, answers } = req.body;
    if (!text || !answers || answers.length < 2) {
        return res.status(400).json({ error: 'Question text and at least two answers are required' });
    }

    pool.query('INSERT INTO questions (text, user_id) VALUES ($1, $2) RETURNING id', [text, req.user.id], (err, result) => {
        if (err) {
            console.error('Error creating question:', err);
            return res.status(500).json({ error: 'Failed to create question' });
        }

        const questionId = result.rows[0].id;
        // Bulk insert answers with correct parameterization
        const values = answers.map((_, i) => `($1, $${i + 2})`).join(', ');
        const params = [questionId, ...answers];
        const query = `INSERT INTO answers (question_id, text) VALUES ${values} RETURNING id, text`;
        pool.query(query, params)
          .then(result => {
            res.status(201).json({
              id: questionId,
              text,
              answers: result.rows.map((row) => ({
                id: row.id,
                text: row.text,
                votes: 0
              }))
            });
          })
          .catch(err => {
            console.error('Error inserting answers:', err);
            res.status(500).json({ error: 'Failed to insert answers' });
          });
    });
});

// Vote on question
app.post('/api/questions/:id/vote', authenticateToken, (req, res) => {
    const questionId = req.params.id;
    const { answerId } = req.body;

    if (!answerId) {
        return res.status(400).json({ error: 'Answer ID is required' });
    }

    // Check if user has already voted on this question
    pool.query('SELECT * FROM votes WHERE question_id = $1 AND user_id = $2', [questionId, req.user.id], (err, result) => {
        if (err) {
            console.error('Error checking vote:', err);
            return res.status(500).json({ error: 'Failed to check vote' });
        }

        if (result.rows.length > 0) {
            return res.status(400).json({ error: 'You have already voted on this question' });
        }

        // Record the vote
        pool.query('INSERT INTO votes (question_id, answer_id, user_id) VALUES ($1, $2, $3)', [questionId, answerId, req.user.id], (err) => {
            if (err) {
                console.error('Error recording vote:', err);
                return res.status(500).json({ error: 'Failed to record vote' });
            }
            res.json({ success: true });
        });
    });
});

// Delete question
app.delete('/api/questions/:id', authenticateToken, (req, res) => {
    const questionId = req.params.id;

    // First check if the question belongs to the user
    pool.query('SELECT user_id FROM questions WHERE id = $1', [questionId], (err, result) => {
        if (err) {
            console.error('Error checking question ownership:', err);
            return res.status(500).json({ error: 'Failed to check question ownership' });
        }

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Question not found' });
        }

        if (result.rows[0].user_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to delete this question' });
        }

        // Start a transaction
        pool.query('BEGIN', (err) => {
            if (err) {
                console.error('Error starting transaction:', err);
                return res.status(500).json({ error: 'Failed to start transaction' });
            }

            // Delete in correct order: reactions -> votes -> answers -> question
            pool.query('DELETE FROM question_reactions WHERE question_id = $1', [questionId], (err) => {
                if (err) {
                    console.error('Error deleting reactions:', err);
                    pool.query('ROLLBACK');
                    return res.status(500).json({ error: 'Failed to delete reactions' });
                }

                pool.query('DELETE FROM votes WHERE question_id = $1', [questionId], (err) => {
                    if (err) {
                        console.error('Error deleting votes:', err);
                        pool.query('ROLLBACK');
                        return res.status(500).json({ error: 'Failed to delete votes' });
                    }

                    pool.query('DELETE FROM answers WHERE question_id = $1', [questionId], (err) => {
                        if (err) {
                            console.error('Error deleting answers:', err);
                            pool.query('ROLLBACK');
                            return res.status(500).json({ error: 'Failed to delete answers' });
                        }

                        pool.query('DELETE FROM questions WHERE id = $1', [questionId], (err) => {
                            if (err) {
                                console.error('Error deleting question:', err);
                                pool.query('ROLLBACK');
                                return res.status(500).json({ error: 'Failed to delete question' });
                            }

                            pool.query('COMMIT', (err) => {
                                if (err) {
                                    console.error('Error committing transaction:', err);
                                    return res.status(500).json({ error: 'Failed to commit transaction' });
                                }
                                res.json({ success: true });
                            });
                        });
                    });
                });
            });
        });
    });
});

// Update question
app.put('/api/questions/:id', authenticateToken, (req, res) => {
    const questionId = req.params.id;
    const { text, answers } = req.body;

    if (!text || !answers || answers.length < 2) {
        return res.status(400).json({ error: 'Question text and at least two answers are required' });
    }

    // First check if the question belongs to the user
    pool.query('SELECT user_id FROM questions WHERE id = $1', [questionId], (err, result) => {
        if (err) {
            console.error('Error checking question ownership:', err);
            return res.status(500).json({ error: 'Failed to check question ownership' });
        }

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Question not found' });
        }

        if (result.rows[0].user_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to update this question' });
        }

        // Start a transaction
        pool.query('BEGIN', (err) => {
            if (err) {
                console.error('Error starting transaction:', err);
                return res.status(500).json({ error: 'Failed to start transaction' });
            }

            // Update question text
            pool.query('UPDATE questions SET text = $1 WHERE id = $2', [text, questionId], (err) => {
                if (err) {
                    console.error('Error updating question:', err);
                    pool.query('ROLLBACK', (err) => {
                        if (err) console.error('Error rolling back:', err);
                    });
                    return res.status(500).json({ error: 'Failed to update question' });
                }

                // Delete existing answers
                pool.query('DELETE FROM answers WHERE question_id = $1', [questionId], (err) => {
                    if (err) {
                        console.error('Error deleting old answers:', err);
                        pool.query('ROLLBACK', (err) => {
                            if (err) console.error('Error rolling back:', err);
                        });
                        return res.status(500).json({ error: 'Failed to update answers' });
                    }

                    // Insert new answers
                    const stmt = pool.query('INSERT INTO answers (question_id, text) VALUES ($1, $2) RETURNING id', answers.map((text, index) => [questionId, text]));
                    
                    stmt.then(result => {
                        if (result.rows.length !== answers.length) {
                            console.error('Error inserting new answers:', result.rows.length);
                            pool.query('ROLLBACK', (err) => {
                                if (err) console.error('Error rolling back:', err);
                            });
                            return res.status(500).json({ error: 'Failed to insert answers' });
                        }

                        pool.query('COMMIT', (err) => {
                            if (err) {
                                console.error('Error committing transaction:', err);
                                return res.status(500).json({ error: 'Failed to commit transaction' });
                            }

                            // Get the updated question with answers
                            pool.query(`
                                SELECT 
                                    q.id,
                                    q.text,
                                    q.created_at,
                                    u.username as author
                                FROM questions q
                                LEFT JOIN users u ON q.user_id = u.id
                                WHERE q.id = $1
                            `, [questionId], (err, result) => {
                                if (err) {
                                    console.error('Error fetching updated question:', err);
                                    return res.status(500).json({ error: 'Failed to fetch updated question' });
                                }

                                // Get answers with vote counts
                                pool.query(`
                                    SELECT 
                                        a.id,
                                        a.text,
                                        COUNT(v.id) as votes
                                    FROM answers a
                                    LEFT JOIN votes v ON a.id = v.answer_id
                                    WHERE a.question_id = $1
                                    GROUP BY a.id
                                `, [questionId], (err, result) => {
                                    if (err) {
                                        console.error('Error fetching answers:', err);
                                        return res.status(500).json({ error: 'Failed to fetch answers' });
                                    }

                                    res.json({
                                        ...result.rows[0],
                                        answers: result.rows.map(row => ({
                                            id: row.id,
                                            text: row.text,
                                            votes: row.votes
                                        }))
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// Like or dislike a question
app.post('/api/questions/:id/react', authenticateToken, (req, res) => {
    const questionId = req.params.id;
    const { reaction } = req.body; // 'like' or 'dislike'
    if (!['like', 'dislike'].includes(reaction)) {
        return res.status(400).json({ error: 'Invalid reaction' });
    }
    // Upsert reaction
    pool.query(
        `INSERT INTO question_reactions (user_id, question_id, reaction) VALUES ($1, $2, $3)
         ON CONFLICT(user_id, question_id) DO UPDATE SET reaction = excluded.reaction`,
        [req.user.id, questionId, reaction],
        (err) => {
            if (err) {
                console.error('Error recording reaction:', err);
                return res.status(500).json({ error: 'Failed to record reaction' });
            }
            res.json({ success: true });
        }
    );
});

// Get like/dislike counts for a question
app.get('/api/questions/:id/reactions', (req, res) => {
    const questionId = req.params.id;
    pool.query(
        `SELECT reaction, COUNT(*) as count FROM question_reactions WHERE question_id = $1 GROUP BY reaction`,
        [questionId],
        (err, result) => {
            if (err) {
                console.error('Error fetching reactions:', err);
                return res.status(500).json({ error: 'Failed to fetch reactions' });
            }
            const counts = { like: 0, dislike: 0 };
            result.rows.forEach(r => { counts[r.reaction] = r.count; });
            res.json(counts);
        }
    );
});

// Helper to get like/dislike counts for all questions
function getReactionsForQuestions(questionIds) {
    return new Promise((resolve, reject) => {
        if (!questionIds.length) return resolve({});
        pool.query(
            `SELECT question_id, reaction, COUNT(*) as count FROM question_reactions WHERE question_id IN (${questionIds.map(() => '$').join(',')}) GROUP BY question_id, reaction`,
            questionIds,
            (err, result) => {
                if (err) return reject(err);
                const map = {};
                result.rows.forEach(r => {
                    if (!map[r.question_id]) map[r.question_id] = { like: 0, dislike: 0 };
                    map[r.question_id][r.reaction] = r.count;
                });
                resolve(map);
            }
        );
    });
}

// Helper to get vote counts for all questions
function getVotesForQuestions(questionIds) {
    return new Promise((resolve, reject) => {
        if (!questionIds.length) return resolve({});
        pool.query(
            `SELECT q.id as question_id, COUNT(v.id) as votes
             FROM questions q
             LEFT JOIN answers a ON a.question_id = q.id
             LEFT JOIN votes v ON v.answer_id = a.id
             WHERE q.id IN (${questionIds.map(() => '$').join(',')})
             GROUP BY q.id`,
            questionIds,
            (err, result) => {
                if (err) return reject(err);
                const map = {};
                result.rows.forEach(r => { map[r.question_id] = r.votes; });
                resolve(map);
            }
        );
    });
}

// Helper to get answers (with vote counts) for a question
function getAnswersForQuestion(questionId) {
    return new Promise((resolve, reject) => {
        pool.query(
            `SELECT a.id, a.text, COUNT(v.id) as votes
             FROM answers a
             LEFT JOIN votes v ON a.id = v.answer_id
             WHERE a.question_id = $1
             GROUP BY a.id`,
            [questionId],
            (err, result) => {
                if (err) return reject(err);
                resolve(result.rows.map(r => ({ id: r.id, text: r.text, votes: r.votes })));
            }
        );
    });
}

// /api/questions/top?sort=mostVotes|mostLiked|trending|recent
app.get('/api/questions/top', async (req, res) => {
    const sort = req.query.sort || 'mostVotes';
    const timeRange = req.query.timeRange || 'all';
    const category = req.query.category || 'all';
    const minVotes = parseInt(req.query.minVotes) || 0;

    let baseQuery = `
        SELECT 
            q.id, 
            q.text, 
            q.created_at, 
            u.username as author,
            COALESCE(vq.votes, 0) as votes,
            COALESCE(qr.likes, 0) as likes,
            COALESCE(qr.dislikes, 0) as dislikes,
            (COALESCE(vq.votes, 0) + COALESCE(qr.likes, 0) * 2) as engagement
        FROM questions q
        LEFT JOIN users u ON q.user_id = u.id
        LEFT JOIN (
            SELECT q.id as qid, COUNT(v.id) as votes
            FROM questions q
            LEFT JOIN answers a ON a.question_id = q.id
            LEFT JOIN votes v ON v.answer_id = a.id
            GROUP BY q.id
        ) vq ON vq.qid = q.id
        LEFT JOIN (
            SELECT question_id, 
                   SUM(CASE WHEN reaction = 'like' THEN 1 ELSE 0 END) as likes,
                   SUM(CASE WHEN reaction = 'dislike' THEN 1 ELSE 0 END) as dislikes
            FROM question_reactions
            GROUP BY question_id
        ) qr ON qr.question_id = q.id
    `;

    let whereConditions = [];
    let params = [];

    // Time range filter
    if (timeRange !== 'all') {
        const now = new Date();
        let startDate;
        switch (timeRange) {
            case 'today':
                startDate = new Date(now.setHours(0, 0, 0, 0));
                break;
            case 'week':
                startDate = new Date(now.setDate(now.getDate() - 7));
                break;
            case 'month':
                startDate = new Date(now.setMonth(now.getMonth() - 1));
                break;
        }
        whereConditions.push('q.created_at >= $' + (params.length + 1));
        params.push(startDate.toISOString());
    }

    // Category filter (if implemented)
    if (category !== 'all') {
        whereConditions.push('q.category = $' + (params.length + 1));
        params.push(category);
    }

    // Minimum votes filter
    if (minVotes > 0) {
        whereConditions.push('COALESCE(vq.votes, 0) >= $' + (params.length + 1));
        params.push(minVotes);
    }

    // Add WHERE clause if we have conditions
    if (whereConditions.length > 0) {
        baseQuery += ' WHERE ' + whereConditions.join(' AND ');
    }

    // Add sorting
    switch (sort) {
        case 'mostVotes':
            baseQuery += ' ORDER BY votes DESC';
            break;
        case 'mostLiked':
            baseQuery += ' ORDER BY likes DESC';
            break;
        case 'trending':
            baseQuery += ' ORDER BY engagement DESC';
            break;
        case 'recent':
            baseQuery += ' ORDER BY q.created_at DESC';
            break;
        default:
            baseQuery += ' ORDER BY votes DESC';
    }

    // Limit to top 20
    baseQuery += ' LIMIT 20';

    // Execute the query
    pool.query(baseQuery, params, async (err, result) => {
        if (err) {
            console.error('Error fetching top questions:', err);
            return res.status(500).json({ error: 'Failed to fetch top questions' });
        }

        // Get answers for each question
        try {
            const questionsWithAnswers = await Promise.all(result.rows.map(async (question) => {
                const answers = await getAnswersForQuestion(question.id);
                return {
                    ...question,
                    answers
                };
            }));
            res.json(questionsWithAnswers);
        } catch (err) {
            console.error('Error fetching answers:', err);
            res.status(500).json({ error: 'Failed to fetch answers' });
        }
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
