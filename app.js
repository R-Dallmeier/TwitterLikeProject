const express = require("express");
const dotenv = require("dotenv");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const pg = require("pg");
const fileUpload = require("express-fileupload");

/* Reading global variables from config file */
dotenv.config();

const conString = process.env.DB_CON_STRING;
const PORT = process.env.PORT;

if (conString == undefined) {
    console.log("ERROR: environment variable DB_CON_STRING not set.");
    process.exit(1);
}

const dbConfig = {
    connectionString: conString,
    ssl: { rejectUnauthorized: false }
}

var dbClient = new pg.Client(dbConfig);
dbClient.connect();

var urlencodedParser = bodyParser.urlencoded({
    extended: false
});

app = express();

app.use(express.static(__dirname + '/public'))

app.use(session({
    secret: "This is a secret!",
    resave: true,
    saveUninitialized: true
}));

app.use(fileUpload());

//configure template engine
app.set("views", "views");
app.set("view engine", "pug");


app.get("/", function(req,res) {

    if(req.session.name == undefined) {

        let count;
        let dateInput;
        let dateCombination;


        dbClient.query("SELECT COUNT(post_id) FROM others", function(dbError,dbResponse){       //get amount of rows to format the dates of
            count = dbResponse.rows[0].count;
        });


        dbClient.query("SELECT users.user_id, name, profile_pic, post_id, text, post_created FROM users JOIN others on users.user_id = others.user_id ORDER BY post_id DESC", function(dbError,dbResponse){

            for(let i=0;i<count;i++){                                   //loop to format dates
                dateInput = new Date(dbResponse.rows[i].post_created);
                dateCombination = dateInput.toLocaleDateString() + " um " + dateInput.getHours() +":" +dateInput.getMinutes();
                dbResponse.rows[i].post_created = dateCombination;
            }

            res.render("landingpage",{othersRows: dbResponse.rows, count: count});
        });
    } else{
        res.redirect("dashboard");
    }

});

app.get("/login", function(req,res) {
    if(req.session.name == undefined) {
        res.render("login");
    } else{
        res.redirect("dashboard");
    }
})

app.post("/login",urlencodedParser,function(req,res){

    if(req.session.name == undefined) {

        let name = req.body.username;
        let password = req.body.password;

        dbClient.query("SELECT * FROM users where name = $1 and password = $2",[name,password], function (dbError,dbResponse){      //get either 1 or 0 rows of matching accounts

            if(dbResponse.rows != 0){
                req.session.name = name;
                res.redirect("dashboard");

            } else{
                res.render("login", {login_error: "Fehler: Nutzer gibt es nicht"});
            }

        });

    } else{
        res.redirect("dashboard");
    }
});

app.get("/register", function (req,res) {
    if(req.session.name == undefined) {
        res.render("register");
    } else{
        res.redirect("dashboard");
    }
});

app.post("/register",urlencodedParser,function(req,res){        //Usernames are unique

    let name = req.body.username;
    let birthday = req.body.birthday;
    let password = req.body.password;
    let user_id;
    let datenowSeconds = Date.now();
    let datenow = new Date(datenowSeconds);


    dbClient.query("SELECT MAX(user_id) FROM users", function (dbError, dbResponse){        //get highest User id and increase it by 1 for new User id
       user_id = dbResponse.rows[0].max;
       user_id += 1;

        if(name != "" || password != "") {          //check if all fields have input

            dbClient.query("SELECT * FROM users WHERE name = $1", [name], function (dbError,dbResponse){

                if(dbResponse.rows == 0) {      //check if username is unique

                    dbClient.query("INSERT INTO users (user_id,name,password,birthday,profile_pic,bio_text,created) VALUES ($1,$2,$3,$4,$5,$6,$7)", [user_id, name, password, birthday, 'default', '', datenow], function (dbError, dbResponse) {
                        res.redirect("login");
                    });

                }else {
                    res.render("register", {register_error: "Nutzername bereits vergeben"})
                }

            })

        }else {
            res.render("register", {register_error: "Bitte alle Felder ausfüllen"})
        }

    });

});

app.get("/logout", function(req,res){

    req.session.destroy();
    res.redirect("/");

});


app.get("/dashboard", function (req, res) {

    if(req.session.name != undefined) {

        let count;
        let dateInput;
        let dateCombination;
        let userID;

        dbClient.query("SELECT user_id FROM users WHERE name = $1", [req.session.name], function(dbErrorID,dbResponseID) {
            userID = dbResponseID.rows[0].user_id;

            //gets the amount of users that the logged in user follows
            dbClient.query("SELECT COUNT(*) FROM users JOIN others on users.user_id = others.user_id WHERE users.user_id != $1 AND EXISTS (SELECT $2 FROM follows WHERE follower = $3 AND followee = users.user_id)",[userID,userID,userID],function (dbErrorCount,dbResponseCount){
                count = dbResponseCount.rows[0].count;

                //gets the data from the users the logged in user follows
                //I am aware that an "if exists" in pug would be easier, but the SQL version is more interesting
                dbClient.query("SELECT users.user_id, name, profile_pic, post_id, text, post_created FROM users JOIN others on users.user_id = others.user_id WHERE users.user_id != $1 AND EXISTS (select $2 from follows where follower = $3 and followee = users.user_id) ORDER BY post_created DESC",[userID,userID,userID],function (dbError,dbResponse){

                    for (let i = 0; i < count; i++) {           //format dates of posts
                        dateInput = new Date(dbResponse.rows[i].post_created);
                        dateCombination = dateInput.toLocaleDateString() + " um " + dateInput.getHours() + ":" + dateInput.getMinutes();
                        dbResponse.rows[i].post_created = dateCombination;
                    }
                    //get the current trending hashtags with regex
                    dbClient.query("select regexp_matches(text, '#([A-Za-z0-9_-]+)') as hashtag, count (*) from others group by regexp_matches(text, '#([A-Za-z0-9_-]+)') order by count (*) desc", function (dbErrorTrends, dbResponseTrends) {
                        res.render("dashboard", {othersRows: dbResponse.rows, count: count, trends: dbResponseTrends.rows});
                    });

                });

            });
        });


    } else{
        res.render("login", {login_error: "Bitte einloggen"});
    }
});


app.get("/profile", function (req,res) {

    if(req.session.name != undefined) {

        let userID;
        let count;
        let dateInput;
        let dateCombination;


        dbClient.query("SELECT users.user_id, name, profile_pic, post_id, text, post_created, birthday, bio_text, created FROM users JOIN others on users.user_id = others.user_id WHERE name = $1 ORDER BY post_id DESC", [req.session.name], function (dbError, dbResponse) {

            if(dbResponse.rows == 0) {
                dbClient.query("SELECT user_id, name, birthday, profile_pic, bio_text, created FROM users WHERE name = $1", [req.session.name], function (dbErrorNoOthers, dbResponseNoOthers){

                    userID = dbResponseNoOthers.rows[0].user_id;
                    //format user birthday and account age
                    dbResponseNoOthers.rows[0].created = new Date(dbResponseNoOthers.rows[0].created).toLocaleDateString();
                    dbResponseNoOthers.rows[0].birthday = new Date(dbResponseNoOthers.rows[0].birthday).toLocaleDateString();

                    //get amount of others and followers/following
                    dbClient.query("SELECT COUNT(1) filter (WHERE follower = $1) as following,COUNT(1) filter (WHERE followee = $2) as followee FROM follows",[userID,userID],function (dbErrorFollowers,dbResponseFollowers){

                        res.render("profile", {rows: dbResponseNoOthers.rows, hasOthers: false, count: 0, followStats: dbResponseFollowers.rows, isLoggedInUser: true});
                    });

                });
            //when user has posts:
            }else {
                userID = dbResponse.rows[0].user_id;

                dbClient.query("SELECT COUNT(post_id) FROM others WHERE user_id = $1", [userID], function (dbError, dbResponseCount) {
                    count = dbResponseCount.rows[0].count;

                    for (let i = 0; i < count; i++) {
                        dateInput = new Date(dbResponse.rows[i].post_created);
                        dateCombination = dateInput.toLocaleDateString() + " um " + dateInput.getHours() + ":" + dateInput.getMinutes();
                        dbResponse.rows[i].post_created = dateCombination;
                    }

                    dbResponse.rows[0].created = new Date(dbResponse.rows[0].created).toLocaleDateString();
                    dbResponse.rows[0].birthday = new Date(dbResponse.rows[0].birthday).toLocaleDateString();

                    dbClient.query("SELECT COUNT(1) filter (WHERE follower = $1) as following,COUNT(1) filter (WHERE followee = $2) as followee FROM follows",[userID,userID],function (dbErrorFollowers,dbResponseFollowers){

                        res.render("profile", {rows: dbResponse.rows, hasOthers: true, count: count, followStats: dbResponseFollowers.rows, isLoggedInUser: true});
                    });



                });
            }

        });


    } else{
        res.render("login", {login_error: "Bitte einloggen"});
    }
})

//see profile without id parameter for comments
app.get("/profile/:id", function (req,res) {

    if(req.session.name != undefined) {

        let userID = req.params.id;
        let count;
        let dateInput;
        let dateCombination;



        dbClient.query("SELECT users.user_id, name, profile_pic, post_id, text, post_created, birthday, bio_text, created FROM users JOIN others on users.user_id = others.user_id WHERE users.user_id = $1 ORDER BY post_id DESC", [req.params.id], function (dbError, dbResponse) {


            if(dbResponse.rows == 0) {
                dbClient.query("SELECT user_id, name, birthday, profile_pic, bio_text, created FROM users WHERE user_id = $1", [req.params.id], function (dbErrorNoOthers, dbResponseNoOthers){

                    dbResponseNoOthers.rows[0].created = new Date(dbResponseNoOthers.rows[0].created).toLocaleDateString();
                    dbResponseNoOthers.rows[0].birthday = new Date(dbResponseNoOthers.rows[0].birthday).toLocaleDateString();

                    dbClient.query("SELECT COUNT(1) filter (WHERE follower = $1) as following,COUNT(1) filter (WHERE followee = $2) as followee FROM follows",[userID,userID],function (dbErrorFollowers,dbResponseFollowers){

                        res.render("profile", {rows: dbResponseNoOthers.rows, hasOthers: false, count: 0, followStats: dbResponseFollowers.rows, isLoggedInUser: false});
                    });


                });

            }else {
                userID = req.params.id;

                dbClient.query("SELECT COUNT(post_id) FROM others WHERE user_id = $1", [userID], function (dbError, dbResponseCount) {
                    count = dbResponseCount.rows[0].count;

                    for (let i = 0; i < count; i++) {
                        dateInput = new Date(dbResponse.rows[i].post_created);
                        dateCombination = dateInput.toLocaleDateString() + " um " + dateInput.getHours() + ":" + dateInput.getMinutes();
                        dbResponse.rows[i].post_created = dateCombination;
                    }

                    dbResponse.rows[0].created = new Date(dbResponse.rows[0].created).toLocaleDateString();
                    dbResponse.rows[0].birthday = new Date(dbResponse.rows[0].birthday).toLocaleDateString();


                    dbClient.query("SELECT COUNT(1) filter (WHERE follower = $1) as following,COUNT(1) filter (WHERE followee = $2) as followee FROM follows",[userID,userID],function (dbErrorFollowers,dbResponseFollowers){

                        res.render("profile", {rows: dbResponse.rows, hasOthers: true, count: count, followStats: dbResponseFollowers.rows, isLoggedInUser: false});
                    });

                });
            }

        });


    } else{
        res.render("login", {login_error: "Bitte einloggen"});
    }
})


app.get("/users", function(req,res){

    if(req.session.name != undefined) {

        let userID;
        //get all current users
        dbClient.query("SELECT user_id FROM users WHERE name = $1", [req.session.name], function(dbErrorUserID, dbResponseUserID){
           userID = dbResponseUserID.rows[0].user_id;

            dbClient.query("SELECT users.user_id, name, profile_pic, EXISTS (SELECT $1 from follows WHERE follower = $2 AND followee = users.user_id) FROM users WHERE user_id != $3 ORDER BY name", [userID,userID,userID], function(dbError, dbResponse){
                //get trends
                dbClient.query("select regexp_matches(text, '#([A-Za-z0-9_-]+)') as hashtag, count (*) from others group by regexp_matches(text, '#([A-Za-z0-9_-]+)') order by count (*) desc", function (dbErrorTrends, dbResponseTrends) {
                    res.render("users",{userRows: dbResponse.rows, trends: dbResponseTrends.rows});
                });

            });

        });


    } else{
        res.render("login", {login_error: "Bitte einloggen"});
    }
});

app.post("/users", urlencodedParser, function (req,res){

    if(req.session.name != undefined) {

        let sessionuserID;

        dbClient.query("SELECT user_id FROM users WHERE name = $1", [req.session.name], function (dbErrorUserID, dbResponseUserID) {
            sessionuserID = dbResponseUserID.rows[0].user_id;

            dbClient.query("SELECT * FROM follows WHERE follower = $1 AND followee = $2", [sessionuserID, req.body.user_id], function (dbError, dbResponse) {
                if (dbResponse.rows == 0) {
                    dbClient.query("INSERT INTO follows (follower,followee) VALUES ($1,$2)", [sessionuserID, req.body.user_id], function (dbErrorInsert, dbResponseInsert) {

                        //hier drunter res.render weil sonst Seite nicht neulädt

                        dbClient.query("SELECT users.user_id, name, profile_pic, EXISTS (SELECT $1 from follows WHERE follower = $2 AND followee = users.user_id) FROM users WHERE user_id != $3 ORDER BY name", [sessionuserID, sessionuserID, sessionuserID], function (dbError, dbResponse) {

                            dbClient.query("select regexp_matches(text, '#([A-Za-z0-9_-]+)') as hashtag, count (*) from others group by regexp_matches(text, '#([A-Za-z0-9_-]+)') order by count (*) desc", function (dbErrorTrends, dbResponseTrends) {
                                res.render("users", {userRows: dbResponse.rows, trends: dbResponseTrends.rows});
                            });

                        });
                        //bis hier nur wegen Seiten neu laden

                    });
                } else {
                    dbClient.query("DELETE FROM follows WHERE follower = $1 AND followee = $2", [sessionuserID, req.body.user_id], function (dbErrorDelete, dbResponseDelete) {

                        //hier drunter res.render weil sonst Seite nicht neulädt

                        dbClient.query("SELECT users.user_id, name, profile_pic, EXISTS (SELECT $1 from follows WHERE follower = $2 AND followee = users.user_id) FROM users WHERE user_id != $3 ORDER BY name", [sessionuserID, sessionuserID, sessionuserID], function (dbError, dbResponse) {
                            dbClient.query("select regexp_matches(text, '#([A-Za-z0-9_-]+)') as hashtag, count (*) from others group by regexp_matches(text, '#([A-Za-z0-9_-]+)') order by count (*) desc", function (dbErrorTrends, dbResponseTrends) {
                                res.render("users", {userRows: dbResponse.rows, trends: dbResponseTrends.rows});
                            });

                        });
                        //bis hier nur wegen Seiten neu laden

                    });
                }
            });

        });
    }else {
        res.render("login", {login_error: "Bitte einloggen"});
    }
});


app.get("/search", function (req,res){

    if(req.session.name != undefined) {

        res.render("search",{userRows: 0});


    } else{
        res.render("login", {login_error: "Bitte einloggen"});
    }
});

app.post("/search",urlencodedParser, function(req,res){

    if(req.session.name != undefined) {

        let userID;
        let searchTerm = req.body.searchTerm;

        dbClient.query("SELECT user_id FROM users WHERE name = $1", [req.session.name], function(dbErrorUserID, dbResponseUserID){
            userID = dbResponseUserID.rows[0].user_id;

            dbClient.query("SELECT users.user_id, name, profile_pic, EXISTS (SELECT $1 from follows WHERE follower = $2 AND followee = users.user_id) FROM users WHERE user_id != $3 AND name LIKE $4 ORDER BY name", [userID,userID,userID,`%${searchTerm}%`], function(dbError, dbResponse){
                res.render("search",{userRows: dbResponse.rows});
            });

        });


    } else{
        res.render("login", {login_error: "Bitte einloggen"});
    }

});



app.get("/other", function (req,res){
    if(req.session.name != undefined) {
        res.render("other");
    } else{
        res.render("login", {login_error: "Bitte einloggen"});
    }

});


app.post("/other", urlencodedParser, function (req,res){

    if(req.session.name != undefined) {

        let userID;
        let other = req.body.other;
        let postID;
        let datenowSeconds = Date.now();
        let datenow = new Date(datenowSeconds);

        if(other != "") {


            dbClient.query("SELECT user_id  FROM users WHERE name = $1", [req.session.name], function (dbErrorID, dbResponseID) {
                userID = dbResponseID.rows[0].user_id;
                //new post_id is +1 previous highest post id
                dbClient.query("SELECT MAX(post_id) from others", function (dbErrorMAX, dbResponseMAX) {
                    postID = dbResponseMAX.rows[0].max + 1;
                    dbClient.query("INSERT INTO others (post_id,user_id,text,post_created) VALUES ($1,$2,$3,$4)", [postID, userID, other, datenow], function (dbError, dbResponse) {
                        res.redirect("profile");
                    });
                });

            });
        }else{
            res.render("other", {error_Message: "Bitte Text eingeben"});
        }

    } else{
        res.render("login", {login_error: "Bitte einloggen"});
    }

});


app.post("/upload",urlencodedParser, function(req,res){

    if(req.session.name != undefined) {
        //check if image was selected to be uploaded
        if (!req.files || Object.keys(req.files).length === 0) {
            console.log("Kein Bild hochgeladen");
            return res.redirect("profile");
        }
        //define path for images to img folder on server(current pc because of localhost)
        let imageUpload = req.files.imageUpload;
        let storagePath = __dirname + "/public/img/users/" + imageUpload.name;
        let imageUploadNameWithoutExtension;
        //move uploaded image
        imageUpload.mv(storagePath, function (err) {
            if (err)
                return res.status(500).send(err);
            //remove image extension
            imageUploadNameWithoutExtension = imageUpload.name.substr(imageUpload.name.lastIndexOf('\\') + 1).split('.')[0];

            dbClient.query("UPDATE users SET profile_pic = $1 WHERE name = $2",[imageUploadNameWithoutExtension,req.session.name],function(dbError,dbResponse){

                res.redirect("profile");
            });
        })

    } else{
        res.render("login", {login_error: "Bitte einloggen"});
    }

});



app.listen(PORT, function() {
  console.log(`OTHer running and listening on port ${PORT}`);
});
