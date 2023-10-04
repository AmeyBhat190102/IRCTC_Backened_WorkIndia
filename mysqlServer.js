import { createPool } from "mysql2";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.listen(5000, () => {
    console.log('Server listening on port 5000');
  });

const pool =  createPool({
    host:"localhost",
    user:"root",
    password:"amey",
    database:"irctc",
    connectionLimit:10
})

app.get("/api/getData",(req,res)=>{
    pool.query(`select * from UsersTable`,(err,result)=>{
        if(err){
            res.send(err)
        }
        res.send(result)
    })
})

// [POST] /api/signup
// Request Data : {
// "username": "example_user",
// "password": "example_password",
// "email": "user@example.com"
// }
// Response Data : {
// "status": "Account successfully created",
// "status_code": 200,
// "user_id": "123445"
// }

app.post("/api/signup", (req, res) => {
    const authToken = "UserToken";
    const userType = "Regular";

    const { username, email, password } = req.body;
    
    pool.query(`select count(*) as count from UsersTable`,(err,result)=>{
        if(err){
            res.send({
                error:err
            })
            return
        }

        const userID = result[0].count + 1

        pool.query(`insert into UsersTable (userID,username, email, password, authenticationToken, userType) VALUES (?,?, ?, ?, ?, ?)`,
        [userID,username, email, password, authToken, userType],
        (err, result) => {
            if (err) {
                res.status(500).send({ 
                    error: "An error occurred during signup." 
                });
                return
            }
            res.send({
                "status": "Account successfully created",
                "status_code": 200,
                "user_id": userID
                })
        }
    );
    })
});

// [POST] /api/login
// Request Data : {
// "username": "example_user",
// "password": "example_password"
// }
// For successful login
// Response Data : {
// "status": "Login successful",
// "status_code": 200,
// "user_id": "12345",
// "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
// }
// For failure
// Response Data: {
// "status": "Incorrect username/password provided. Please retry",
// "status_code": 401
// }

app.post("/api/login",(req,res)=>{

    const {username,password} = req.body

    pool.query(`select userId,authenticationToken from UsersTable where username=? and password=?`,[username,password],(err,result)=>{
        if(err){
            res.send({
                "status": "Incorrect username/password provided. Please retry",
                "status_code": 401
                })
            return
        }
        if(result.length==0){
            res.send({
                "status": "Incorrect username/password provided. Please retry",
                "status_code": 401
            })
        }else{
        res.send({
            "status": "Login successful",
            "status_code": 200,
            "user_id": result[0].userId,
            "access_token": result[0].authenticationToken
            })
        }
    })
})

// [POST] /api/trains/create
// Request Data : {
// "train_name": "Express Train",
// "source": "Station A",
// "destination": "Station B",
// "seat_capacity": 100,
// "arrival_time_at_source": "14:00:00",
// "arrival_time_at_destination": "20:30:00"
// }
// Response Data : {
// "message": "Train added successfully",
// "train_id": "9876543210"
// }

app.post("/api/trains/create", (req, res) => {
    const { authToken, userID } = req.query;
    const { trainName, source, destination, seatCapacity, arrivalSource, arrivalDestination } = req.body;

    const admin = "Admin"

    pool.query(`SELECT * FROM UsersTable WHERE userID=? AND authenticationToken=? AND userType=?`, [userID, authToken, admin], (err, result) => {
        if (err) {
            res.status(500).send({ "message": "Internal Server Error" });
            return;
        }

        if (result.length === 0) {
            res.status(401).send({ "message": "You Don't Have Access To Add Train" });
            return;
        }

        pool.query(`SELECT COUNT(*) AS count FROM TrainTable`, (err, countResult) => {
            if (err) {
                res.status(500).send({ "message": "Internal Server Error" });
                return;
            }

            const newTrainID = countResult[0].count + 1;

            pool.query(`INSERT INTO TrainTable VALUES (?, ?, ?, ?, ?, ?)`, [newTrainID, trainName, source, destination, arrivalSource, arrivalDestination], (err, insertResult) => {
                if (err) {
                    res.status(500).send({ "message": "Unable to Add Train" });
                    return;
                }

                pool.query(`INSERT INTO SeatsTable VALUES (?, ?)`, [newTrainID, seatCapacity], (err, seatResult) => {
                    if (err) {
                        res.status(500).send({ "message": "Unable To Add Seats" });
                        return;
                    } else {
                        res.status(200).send({
                            "message": "Train added successfully",
                            "train_id": newTrainID
                        });
                    }
                });
            });
        });
    });
});

// [GET] /api/trains/availability?source=SOURCE&destination=DESTINATION
// Request Data : {}
// Params: {
// "source": str
// "destination": str
// }
// Response Data : [
// {
// "train_id": "9876543210",
// "train_name": "Express Train",
// "available_seats": 75
// },
// {
// "train_id": "9876543211",
// "train_name": "Express Train 2",
// "available_seats": 0
// }
// ]

app.get("/api/trains/availabilities",(req,res)=>{
    const {source,destination} = req.query

    pool.query(`select TrainTable.trainName as trainName, TrainTable.trainID as trainID , SeatsTable.seatNumbersAvailable as seatsAvailable
                    from TrainTable left join SeatsTable on TrainTable.trainID = SeatsTable.trainID 
                    where TrainTable.source=? and TrainTable.destination=?`,[source,destination],(err,result)=>{
        if(err){
            res.send({
                "message" : "Error Has Occured" ,
                "error" : err
            })
            return
        }
        res.send({
            "result" : result
        })
    })
})

// [POST] /api/trains/{train_id}/book
// Headers : {
// "Authorization": "Bearer {token}"
// }
// Request Data : {
// "user_id": "1234567890",
// "no_of_seats": 2
// }
// Response Data : {
// "message": "Seat booked successfully",
// "booking_id": "5432109876",
// "seat_numbers": [5,6]
// }


app.post("/api/trains/:trainID/book",(req,res)=>{

    const trainId = req.params.trainID

    const {userID,noOfSeats,authToken} = req.body

    pool.query(`select * from UsersTable where userID=? and authenticationToken=? and userType="Regular"`,[userID,authToken],(err,result)=>{
        if(err){
            res.send({
                "message" : "Unable To Make Request" 
            })
            return
        }
        if(result.length===0){
            res.send({
                "message" : "You Cannot Book A Train"
            })
            return
        }
        pool.query(`select seatNumbersAvailable as seats from SeatsTable where trainId = ?`,[trainId],(err,result)=>{
            if(err){
                res.send({
                    "message" : "Unable To Process Request"
                })
                return
            }
            if(result[0].seats>=noOfSeats){
                pool.query(`update SeatsTable set seatNumbersAvailable = ? where trainID = ?`,[result[0].seats - noOfSeats , trainId],(err,result)=>{
                    if(err){
                        res.send({
                            "message" : "Unable To Process Request"
                        })
                        return
                    }
                    pool.query(`select count(*) as count from BookingsTable`,(err,result)=>{
                        if(err){
                            res.send({
                                "message" : "Unable To Process Request"
                            })
                            return
                        }
                        const newBookingID = result[0].count + 1

                        pool.query(`insert into BookingsTable values(?,?,?,?)`,[newBookingID,trainId,userID,noOfSeats],(err,result)=>{
                            if(err){
                                res.send({
                                    "message" :  "Unable To Make Your Booking"
                                })
                                return 
                            }
                            res.send({
                                "message": "Seat booked successfully",
                                "booking_id": newBookingID
                            })
                        })


                    })
                })
            }else{
                res.send({
                    "message" : "Sorry We Dont Have Enough Seats"
                })
            }
        })

    })
})

// [GET] /api/bookings/{booking_id}
// Headers : {
// "Authorization": "Bearer {token}"
// }
// Request Data : {}
// Response Data : {
// "booking_id": "5432109876",
// "train_id": "9876543210",
// "train_name": "Express Train",
// "user_id": "1234567890",
// "no_of_seats": 1
// "seat_numbers": [7],
// "arrival_time_at_source": "2023-01-01 14:00:00",
// "arrival_time_at_destination": "2023-01-01 20:30:00"
// }

app.get("/api/bookings/:bookingID/:authToken",(req,res)=>{

    const bookingID = req.params.bookingID
    const authToken = req.params.authToken

    for(let i=0;i<5;i++){
        console.log("Hello" + " " +  bookingID + " " + authToken)
    }

    res.send({
        "message" : "Hello"
    })

    
// mysql> SELECT
//     ->     BookingsTable.bookingID AS booking_id,
//     ->     TrainTable.trainID AS train_id,
//     ->     TrainTable.trainName AS train_name,
//     ->     UsersTable.userID AS user_id,
//     ->     BookingsTable.seatsRequired AS no_of_seats,
//     ->     TrainTable.arrivalTime AS arrival_time_at_source,
//     ->     TrainTable.departureTime as departute_time_dest
//     ->    , PassengersTable.seatNumbers as seat_numbers
//     -> FROM BookingsTable
//     -> JOIN TrainTable ON BookingsTable.trainID = TrainTable.trainID
//     -> JOIN UsersTable ON BookingsTable.userID = UsersTable.userID
//     -> LEFT JOIN PassengersTable ON BookingsTable.bookingID = PassengersTable.bookingID;


})

