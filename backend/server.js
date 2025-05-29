const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const port = 3000;
const JWT_SECRET = 'supersecret';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Database setup
const db = new sqlite3.Database('szavazza.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        // Create tables if they don't exist
        db.serialize(() => {
            // Create tables with proper schema if they don't exist
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                user_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS answers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question_id INTEGER,
                text TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (question_id) REFERENCES questions(id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question_id INTEGER,
                answer_id INTEGER,
                user_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (question_id) REFERENCES questions(id),
                FOREIGN KEY (answer_id) REFERENCES answers(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS question_reactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                question_id INTEGER,
                reaction TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (question_id) REFERENCES questions(id)
            )`);
        });
    }
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
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash], function(err) {
        if (err) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        const user = { id: this.lastID, username };
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
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
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
    db.all(`
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
    `, [], (err, questions) => {
        if (err) {
            console.error('Error fetching questions:', err);
            res.status(500).json({ error: 'Failed to fetch questions' });
            return;
        }

        // For each question, get its answers and votes
        const getAnswersAndVotes = (questionId) => {
            return new Promise((resolve, reject) => {
                db.all(`
                    SELECT 
                        a.id,
                        a.text,
                        COUNT(v.id) as votes
                    FROM answers a
                    LEFT JOIN votes v ON a.id = v.answer_id
                    WHERE a.question_id = ?
                    GROUP BY a.id
                `, [questionId], (err, answers) => {
                    if (err) reject(err);
                    else resolve(answers);
                });
            });
        };

        // Process all questions with their answers
        Promise.all(questions.map(async (question) => {
            const answers = await getAnswersAndVotes(question.id);
            return {
                ...question,
                answers: answers.map(answer => ({
                    id: answer.id,
                    text: answer.text,
                    votes: answer.votes
                }))
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
    db.all(`
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
        WHERE q.user_id = ?
        ORDER BY q.created_at DESC
    `, [req.user.id], async (err, questions) => {
        if (err) {
            console.error('Error fetching user questions:', err);
            res.status(500).json({ error: 'Failed to fetch user questions' });
            return;
        }

        // Get answers for each question
        try {
            const questionsWithAnswers = await Promise.all(questions.map(async (question) => {
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

// Create question
app.post('/api/questions', authenticateToken, (req, res) => {
    const { text, answers } = req.body;
    if (!text || !answers || answers.length < 2) {
        return res.status(400).json({ error: 'Question text and at least two answers are required' });
    }

    db.run('INSERT INTO questions (text, user_id) VALUES (?, ?)', [text, req.user.id], function(err) {
        if (err) {
            console.error('Error creating question:', err);
            return res.status(500).json({ error: 'Failed to create question' });
        }

        const questionId = this.lastID;
        const stmt = db.prepare('INSERT INTO answers (question_id, text) VALUES (?, ?)');
        
        answers.forEach(answer => {
            stmt.run(questionId, answer);
        });
        
        stmt.finalize();

        res.status(201).json({
            id: questionId,
            text,
            answers: answers.map((text, index) => ({
                id: index + 1,
                text,
                votes: 0
            }))
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
    db.get('SELECT * FROM votes WHERE question_id = ? AND user_id = ?', [questionId, req.user.id], (err, vote) => {
        if (err) {
            console.error('Error checking vote:', err);
            return res.status(500).json({ error: 'Failed to check vote' });
        }

        if (vote) {
            return res.status(400).json({ error: 'You have already voted on this question' });
        }

        // Record the vote
        db.run('INSERT INTO votes (question_id, answer_id, user_id) VALUES (?, ?, ?)',
            [questionId, answerId, req.user.id],
            function(err) {
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
    db.get('SELECT user_id FROM questions WHERE id = ?', [questionId], (err, question) => {
        if (err) {
            console.error('Error checking question ownership:', err);
            return res.status(500).json({ error: 'Failed to check question ownership' });
        }

        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        if (question.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to delete this question' });
        }

        // Delete votes first (due to foreign key constraints)
        db.run('DELETE FROM votes WHERE question_id = ?', [questionId], (err) => {
            if (err) {
                console.error('Error deleting votes:', err);
                return res.status(500).json({ error: 'Failed to delete votes' });
            }

            // Delete answers
            db.run('DELETE FROM answers WHERE question_id = ?', [questionId], (err) => {
                if (err) {
                    console.error('Error deleting answers:', err);
                    return res.status(500).json({ error: 'Failed to delete answers' });
                }

                // Finally delete the question
                db.run('DELETE FROM questions WHERE id = ?', [questionId], (err) => {
                    if (err) {
                        console.error('Error deleting question:', err);
                        return res.status(500).json({ error: 'Failed to delete question' });
                    }
                    res.json({ success: true });
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
    db.get('SELECT user_id FROM questions WHERE id = ?', [questionId], (err, question) => {
        if (err) {
            console.error('Error checking question ownership:', err);
            return res.status(500).json({ error: 'Failed to check question ownership' });
        }

        if (!question) {
            return res.status(404).json({ error: 'Question not found' });
        }

        if (question.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized to update this question' });
        }

        // Start a transaction
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            // Update question text
            db.run('UPDATE questions SET text = ? WHERE id = ?', [text, questionId], (err) => {
                if (err) {
                    console.error('Error updating question:', err);
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Failed to update question' });
                }

                // Delete existing answers
                db.run('DELETE FROM answers WHERE question_id = ?', [questionId], (err) => {
                    if (err) {
                        console.error('Error deleting old answers:', err);
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Failed to update answers' });
                    }

                    // Insert new answers
                    const stmt = db.prepare('INSERT INTO answers (question_id, text) VALUES (?, ?)');
                    let hasError = false;

                    answers.forEach(answer => {
                        stmt.run(questionId, answer, (err) => {
                            if (err) {
                                console.error('Error inserting new answer:', err);
                                hasError = true;
                            }
                        });
                    });

                    stmt.finalize();

                    if (hasError) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Failed to update answers' });
                    }

                    db.run('COMMIT', (err) => {
                        if (err) {
                            console.error('Error committing transaction:', err);
                            return res.status(500).json({ error: 'Failed to update question' });
                        }

                        // Get the updated question with answers
                        db.get(`
                            SELECT 
                                q.id,
                                q.text,
                                q.created_at,
                                u.username as author
                            FROM questions q
                            LEFT JOIN users u ON q.user_id = u.id
                            WHERE q.id = ?
                        `, [questionId], (err, question) => {
                            if (err) {
                                console.error('Error fetching updated question:', err);
                                return res.status(500).json({ error: 'Failed to fetch updated question' });
                            }

                            // Get answers with vote counts
                            db.all(`
                                SELECT 
                                    a.id,
                                    a.text,
                                    COUNT(v.id) as votes
                                FROM answers a
                                LEFT JOIN votes v ON a.id = v.answer_id
                                WHERE a.question_id = ?
                                GROUP BY a.id
                            `, [questionId], (err, answers) => {
                                if (err) {
                                    console.error('Error fetching answers:', err);
                                    return res.status(500).json({ error: 'Failed to fetch answers' });
                                }

                                res.json({
                                    ...question,
                                    answers: answers.map(answer => ({
                                        id: answer.id,
                                        text: answer.text,
                                        votes: answer.votes
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

// Like or dislike a question
app.post('/api/questions/:id/react', authenticateToken, (req, res) => {
    const questionId = req.params.id;
    const { reaction } = req.body; // 'like' or 'dislike'
    if (!['like', 'dislike'].includes(reaction)) {
        return res.status(400).json({ error: 'Invalid reaction' });
    }
    // Upsert reaction
    db.run(
        `INSERT INTO question_reactions (user_id, question_id, reaction) VALUES (?, ?, ?)
         ON CONFLICT(user_id, question_id) DO UPDATE SET reaction = excluded.reaction`,
        [req.user.id, questionId, reaction],
        function (err) {
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
    db.all(
        `SELECT reaction, COUNT(*) as count FROM question_reactions WHERE question_id = ? GROUP BY reaction`,
        [questionId],
        (err, rows) => {
            if (err) {
                console.error('Error fetching reactions:', err);
                return res.status(500).json({ error: 'Failed to fetch reactions' });
            }
            const result = { like: 0, dislike: 0 };
            rows.forEach(r => { result[r.reaction] = r.count; });
            res.json(result);
        }
    );
});

// Helper to get like/dislike counts for all questions
function getReactionsForQuestions(questionIds) {
    return new Promise((resolve, reject) => {
        if (!questionIds.length) return resolve({});
        db.all(
            `SELECT question_id, reaction, COUNT(*) as count FROM question_reactions WHERE question_id IN (${questionIds.map(() => '?').join(',')}) GROUP BY question_id, reaction`,
            questionIds,
            (err, rows) => {
                if (err) return reject(err);
                const map = {};
                rows.forEach(r => {
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
        db.all(
            `SELECT q.id as question_id, COUNT(v.id) as votes
             FROM questions q
             LEFT JOIN answers a ON a.question_id = q.id
             LEFT JOIN votes v ON v.answer_id = a.id
             WHERE q.id IN (${questionIds.map(() => '?').join(',')})
             GROUP BY q.id`,
            questionIds,
            (err, rows) => {
                if (err) return reject(err);
                const map = {};
                rows.forEach(r => { map[r.question_id] = r.votes; });
                resolve(map);
            }
        );
    });
}

// Helper to get answers (with vote counts) for a question
function getAnswersForQuestion(questionId) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT a.id, a.text, COUNT(v.id) as votes
             FROM answers a
             LEFT JOIN votes v ON a.id = v.answer_id
             WHERE a.question_id = ?
             GROUP BY a.id`,
            [questionId],
            (err, rows) => {
                if (err) return reject(err);
                resolve(rows.map(r => ({ id: r.id, text: r.text, votes: r.votes })));
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
        whereConditions.push('q.created_at >= ?');
        params.push(startDate.toISOString());
    }

    // Category filter (if implemented)
    if (category !== 'all') {
        whereConditions.push('q.category = ?');
        params.push(category);
    }

    // Minimum votes filter
    if (minVotes > 0) {
        whereConditions.push('COALESCE(vq.votes, 0) >= ?');
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
    db.all(baseQuery, params, async (err, questions) => {
        if (err) {
            console.error('Error fetching top questions:', err);
            return res.status(500).json({ error: 'Failed to fetch top questions' });
        }

        // Get answers for each question
        try {
            const questionsWithAnswers = await Promise.all(questions.map(async (question) => {
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
