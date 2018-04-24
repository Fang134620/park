const mysql = require('mysql');

const database = mysql.createConnection({
    host:"localhost",
    user:"root",
    port:"3306",
    password:"134620",
    database:"parking-place"
});

database.connect();

module.exports = database;