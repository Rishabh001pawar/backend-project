const express = require('express');
const app = express();
const userModel = require('./models/user');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const postModel = require('./models/post');

app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


app.get('/', (req, res) => {
    res.render('index');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/profile',isLoggedIn, async (req, res) => {
    let user = await userModel.findOne({email: req.user.email}).populate("posts");
    res.render('profile', { user });
});


app.get('/like/:id',isLoggedIn, async (req, res) => {
    // find the post by id (from the route param)
    const postId = req.params.id;
    const post = await postModel.findById(postId).populate('user');

    if (!post) {
        console.warn('Like: post not found', postId);
        return res.status(404).send('Post not found');
    }

    const userIdStr = String(req.user.userid);
    const idx = post.likes.findIndex(l => String(l) === userIdStr);
    if (idx === -1) {
        post.likes.push(req.user.userid);
    } else {
        post.likes.splice(idx, 1);
    }

    await post.save();
    return res.redirect('/profile');
});


app.post('/post', isLoggedIn, async (req, res) => {
    let user = await userModel.findOne({email: req.user.email});
    let post = await postModel.create({
        user: user._id,
        content: req.body.content
    })
    user.posts.push(post._id);
    await user.save();
});

// Edit post page (render form)
app.get('/edit/:id', isLoggedIn, async (req, res) => {
    const postId = req.params.id;
    const post = await postModel.findById(postId);
    if (!post) return res.status(404).send('Post not found');

    if (String(post.user) !== String(req.user.userid)) return res.status(403).send('Forbidden');

    res.render('edit', { post });
});

// Handle edit post submission
app.post('/edit/:id', isLoggedIn, async (req, res) => {
    const postId = req.params.id;
    const post = await postModel.findById(postId);
    if (!post) return res.status(404).send('Post not found');

    if (String(post.user) !== String(req.user.userid)) return res.status(403).send('Forbidden');

    post.content = req.body.content;
    await post.save();
    res.redirect('/profile');
});

app.get('/register', (req, res) => {
    res.render('index');
});

app.post('/register', async (req, res) => {
    let { email, password, name, username, age } = req.body;

    let user = await userModel.findOne({ email });
    if (user) return res.status(400).send('User already exists');


    bcrypt.genSalt(10, (err, salt) => {
        bcrypt.hash(password, salt, async (err, hash) => {

            let newUser = await userModel.create({
                username,
                name,
                age,
                email,
                password: hash
            });

            // Generate JWT for the new user
            let token = jwt.sign({ email: newUser.email, userid: newUser._id }, 'secretkey');

            // Set token cookie
            res.cookie('token', token);
            res.send('User registered successfully');
        });
    });
});

app.post('/login',async (req, res) => {
    let { email, password } = req.body;

    let user = await userModel.findOne({ email });
    if (!user) return res.status(400).send('Something went wrong');

    bcrypt.compare(password, user.password,function (err, result) {
        if (err) {
            console.error('bcrypt compare error:', err);
            return res.status(500).send('Server error');
        }
        if(result){
            // use the found `user` (not newUser which is undefined in login flow)
            let token = jwt.sign({ email: user.email, userid: user._id }, process.env.JWT_SECRET || 'secretkey');
            res.cookie('token', token);
            res.status(200).redirect('/profile');
        } else {
            res.redirect('/login');
        }
    })

});

app.get('/logout', (req, res) => {
    res.cookie('token', "");
    res.redirect('/login');
});

function isLoggedIn(req, res, next) {
    const token = req.cookies && req.cookies.token;
    if (!token) {
        return res.redirect('/login');
    }

    try {
        const data = jwt.verify(token, process.env.JWT_SECRET || 'secretkey');
        req.user = data;
        return next();
    } catch (err) {
        console.error('JWT verification failed:', err);
        // Invalid/expired token - redirect to login
        return res.redirect('/login');
    }
}

app.listen(3000, () =>{
    console.log('Server is running on port 3000');
});