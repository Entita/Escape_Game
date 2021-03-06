// Server config
const express = require('express')
const app = express()
const server = require('http').createServer(app)
const bodyParser = require('body-parser')

// Redis
const redis = require("redis")
const { stringify } = require('querystring')
const client = redis.createClient(process.env.REDIS_URL)

// Stripe
const stripe = require('stripe')(process.env.STRIPE_PRIVATE_KEY)
const storeItems = new Map([
    [1, { priceInCents: 7000, name: 'Kup si escape hru na 1hod' }],
    [2, { priceInCents: 20000, name: 'Kup si escape hru na neurčitou dobu' }]
])

// Redis users
const users = new Object()

client.smembers('users', (err, reply) => {
    reply.map(user => {
        user = JSON.parse(user)
        users[user.email] = user
    })
    console.log(users)
})

// Functions
function randomString(length) {
    var result = ''
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    var charactersLength = characters.length
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength))
    }
    return result
}

app.use(bodyParser())

app.post('/creating-checkout-session', async (req, res) => {
    try {
        const random_string = randomString(64),
            expire_time = 60,
            session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                mode: 'payment',
                line_items: req.body.items.map(item => {
                    const storeItem = storeItems.get(item.id)
                    return {
                        price_data: {
                            currency: 'czk',
                            product_data: {
                                name: storeItem.name
                            },
                            unit_amount: storeItem.priceInCents
                        },
                        quantity: 1
                    }
                }),
                success_url: 'https://escape-game-cz.herokuapp.com/game/' + random_string,
                cancel_url: 'https://escape-game-cz.herokuapp.com'
            })

        client.set(random_string, 'example@example.com')
        client.expire(random_string, expire_time)

        res.json({ url: session.url })
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

app.post('/create-account', (req, res) => {
    try {
        const new_user = {
            email: req.body.email,
            username: req.body.username,
            password: req.body.password
        }
        client.sadd('users', JSON.stringify(new_user))
        users[new_user.email] = new_user
        res.json({ success: true })
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

app.post('/login', (req, res) => {
    try {
        const email = req.body.email,
            password = req.body.password
        if (users[email]) {
            res.json({ success: users[email].password === password, user: users[email] })
        } else {
            res.json({ success: 'user' })
        }
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

app.get('/game/:id', (req, res) => {
    const client_key = req.params.id
    client.exists(client_key, (err, reply) => {
        if (reply === 1) {
            res.sendFile('index.html', { root: './public' })
        } else {
            res.send('Key doesn\'t exists')
        }
    })
})

app.get('*', (req, res) => {
    // Get all paths
    const get_path = req.params[0]
    var get_file = get_path.split('/public/')[1]

    if (get_path.startsWith('/public/') && get_file != 'index.html') {
        // Availability to get any files from /public folder on call
        res.sendFile(get_file, { root: './public' })
    } else if (get_path.startsWith('/default/')) {
        // Availability to get any files from /default folder on call
        get_file = get_path.split('/default/')[1]
        res.sendFile(get_file, { root: './default' })
    } else {
        // If not calling public or default folder, then respond with default file
        res.sendFile('index.html', { root: './default' })
    }
})

server.listen(process.env.PORT || 3000, (req, res) => {
    console.log('Server is listening ...')
});