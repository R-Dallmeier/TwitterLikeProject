const fs = require("fs");
const csvparser = require("csv-parse");
const pg = require("pg");
const dotenv = require("dotenv");

dotenv.config();       //DB Connection

const conString = process.env.DB_CON_STRING;

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

//dbClient.query("INSERT INTO users (user_id, name, password, birthday, profile_pic, bio_text, created) VALUES (107, 'santa','Test12345#','1999-12-31 23:00:00.000000 +00:00','santa','','2022-11-29 11:49:13.533253 +00:00')");

const processFile = async () => {
    const parser = fs
        .createReadStream("others.csv")
        .pipe (csvparser.parse());
    for await (const record of parser) {
        //console.log(record[1]);
        dbClient.query("INSERT INTO others (post_id,user_id,text,post_created) VALUES ($1,$2,$3,$4)", [record[0],record[1],record[2],record[3]], function(dbError,dbResponse){
            console.log(dbResponse);
            console.log(dbError);
        });
    }
};

(async() => {
    await processFile() ;
})() ;