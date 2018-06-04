var express = require('express');
var router = express.Router();
var db = require('./../database');
var crypto = require('crypto');
var mysql = require('mysql');

Date.prototype.format = function(fmt) { 
  var o = { 
     "M+" : this.getMonth()+1,                 //月份 
     "d+" : this.getDate(),                    //日 
     "h+" : this.getHours(),                   //小时 
     "m+" : this.getMinutes(),                 //分 
     "s+" : this.getSeconds(),                 //秒 
     "q+" : Math.floor((this.getMonth()+3)/3), //季度 
     "S"  : this.getMilliseconds()             //毫秒 
 }; 
 if(/(y+)/.test(fmt)) {
         fmt=fmt.replace(RegExp.$1, (this.getFullYear()+"").substr(4 - RegExp.$1.length)); 
 }
  for(var k in o) {
     if(new RegExp("("+ k +")").test(fmt)){
          fmt = fmt.replace(RegExp.$1, (RegExp.$1.length==1) ? (o[k]) : (("00"+ o[k]).substr((""+ o[k]).length)));
      }
  }
 return fmt; 
}

/*注册*/
router.post('/register',function(req,res,next){
  var userName = req.body.userName;
  var password = req.body.password;
  var phone = req.body.phone;
  var hash = crypto.createHash('md5');
  hash.update(password);
  password = hash.digest('hex');
  var query1 = 'select * from user where userName = \"'+userName+'\" or phone = \"'+phone+'\"';
  var query2 = 'insert into user set userName = '+mysql.escape(userName)+',password = '+mysql.escape(password)+',nickname = \"user'+mysql.escape(userName)+'\",credit = 100,usable = 1,phone = '+phone;
  var query3 = 'select userID,userName,nickname from user where userName = \"'+userName+'\"';
  db.query(query1,function(err,rows,fields){
    if(err)console.log(err);
    if(rows[0]){
      res.json({success:0,message:'用户已存在或手机号已注册'});
    }else{
      db.query(query2,function(err,rows,fields){
        db.query(query3,function(err,rows,fields){
          req.session.userID = rows[0].userID;
          req.session.userName = rows[0].userName;
          req.session.nickname = rows[0].nickname;
          res.json({success:1,message:null});
        })
      })
    }
  })
})

/*登录*/
router.post('/login',function(req,res,next){
  var userName = req.body.userName;
  var password = req.body.password;
  console.log(userName,password);
  var hash = crypto.createHash('md5');
  hash.update(password);
  password = hash.digest('hex');
  function doLogin(){
    return new Promise(function(resolve,reject){
      var query1 = 'select userID,nickname,usable from user where userName ='+mysql.escape(userName)+' and password = '+mysql.escape(password);
      db.query(query1,function(err,rows,fields){
        if(err)console.log(err);
        resolve(rows[0]);
      })
    })
  }
  async function funs(){
    var query2 = 'update share set state = 3 where state =0 and endTime<NOW()';
    var query3 = 'delete from notice where noticeTime < date_add(NOW(),interval -3 day)';
    let docs = [query2,query3];
    let promises = docs.map((doc) =>{
      return new Promise(function(resolve,reject){
        db.query(doc,function(err,rows,fields){
          if(err)console.log(err);
          resolve();
        })
      })
    })
    var dologin = await doLogin();
    if(dologin){
      if(dologin.usable){
        req.session.userID = dologin.userID;
        req.session.userName = userName;
        req.session.nickname = dologin.nickname;
        var results = await Promise.all(promises);
        res.json({success:1,message:null}); 
      }else{
        res.json({success:2,message:"用户已被冻结"});
      }
      
    }else{
      res.json({success:0,message:'用户名或密码错误'});
    }
  }
  funs();
})

/*注销*/
router.get('/logout',function(req,res,next){
  req.session.userID = '';
  req.session.userName = '';
  req.session.nickname = '';
  res.json({success:1});
})


/*搜索结果*/
router.get('/search',function(req,res,next){
  var positionA = req.query.positionA;
  var positionB = req.query.positionB;
  var query = 'select * from share where state = 0 and abs(power(positionA - positionA,2)+power(positionB - positionB,2)) < 0.010727846709490473 order by positionA,positionB';
  db.query(query,function(err,rows,fields){
    if(err)console.log(err);
    var shares = rows;
    shares.map((share) => {
      share.beginTimeString = share.beginTime.format("yyyy-MM-dd hh:mm:ss");
      share.endTimeString = share.endTime.format("yyyy-MM-dd hh:mm:ss");
    })
    res.json({success:1,shares:shares});
  })
})

/*消息列表*/
router.get('/msgList',function(req,res,next){
  var userID = req.session.userID;
  var query1 = 'select * from notice order by noticeTime';
  var query2 = 'select * from message where receiveID = '+userID+' order by sendTime';
  async function getMsg(){
    let docs = [query1,query2];
    let promises = docs.map((doc)=>{
      return new Promise(function(resolve,reject){
        db.query(doc,function(err,rows,fields){
          if(err)console.log(err);
          resolve(rows);
        })
      })
    })
    let msgs = await Promise.all(promises);
    let Msgs = msgs[1];
    let Notices = msgs[0];
    Msgs.map((Msg) => {
      Msg.timeString = Msg.sendTime.format("yyyy-MM-dd hh:mm:ss");
    })
    Notices.map((Notice) => {
      Notice.timeString = Notice.noticeTime.format("yyyy-MM-dd hh:mm:ss");
    })
    res.json({success:1,notices:Notices,messages:Msgs});
  }
  getMsg();
})

/*消息详情*/
router.get('/message/:messageID',function(req,res,next){
  var messageID = req.params.messageID;
  var query = 'select * from message where messageID ='+messageID;
  db.query(query,function(err,rows,fields){
    res.json({message:rows[0]});
  })
})

/*公告详情*/
router.get('/notice/:noticeID',function(req,res,next){
  var noticeID = req.params.noticeID;
  var query = 'select * from notice where noticeID = '+noticeID;
  db.query(query,function(err,rows,fields){
    res.json({notice:rows[0]});
  })
})

/*删除消息*/
router.post('/message/:messageID/delete',function(req,res,next){
  var messageID = req.params.messageID;
  var query = 'delete from message where messageID ='+messageID;
  db.query(query,function(err,rows,fields){
    res.json({success:1});
  })
})

/*发布车位*/
router.post('/createShare',function(req,res,next){
  var borrowerID = req.session.userID;
  var position = req.body.position;
  var positionA = req.body.positionA;
  var positionB = req.body.positionB;
  var beginTime = req.body.beginTime;
  var endTime = req.body.endTime;
  var cost = req.body.cost;
  var more = req.body.more;
  console.log(position,positionA,positionB,beginTime,endTime,borrowerID,cost,more);
  var dateStringB = new Date(beginTime);
  var dateStringE = new Date(endTime);
  if(dateStringB=="Invalid Date" || dateStringE =="Invalid Date"){
    res.json({success:0,message:"时间格式错误"});
  }else{
    var query2 = 'insert into share set borrowerID = '+borrowerID+',position = \"'+position+'\",positionA = '+positionA+',positionB ='+positionB+',beginTime =\"'+beginTime+'\",endTime =\"'+endTime+'\",state = 0,stars = -1,cost = '+cost+',more = \"'+more+'\"';
    db.query(query2,function(err,rows,fields){
      if(err){
        console.log(err);
        res.json({success:2,message:"发布失败"});
      }else{
        res.json({success:1,message:null});
      }
    })
  }
})

/*车位详情*/
router.get('/share/:shareID',function(req,res,next){
  var shareID = req.params.shareID;
  var userID = req.session.userID;
  var share;
  function getShare(){
    return new Promise(function(resolve,reject){
      var query1 = 'select shareID,position,beginTime,endTime,state,cost,more,borrowerID,renterID,stars,nickname as borrowerName,credit,phone as borrowerPhone from share inner join user on share.borrowerID = user.userID where shareID ='+ shareID;
      db.query(query1,function(err,rows,fields){
        if(rows[0]){
          var share = rows[0];
          share.beginTimeString = share.beginTime.format("yyyy-MM-dd hh:mm:ss");
          share.endTimeString = share.endTime.format("yyyy-MM-dd hh:mm:ss");
          share.renterPhone = null;
          resolve(share);
        }else{
          resolve();
        }
      })
    })
  }
  function getPhone(){
    return new Promise(function(resolve,reject){
      console.log("1111",share);
      query2 = 'select phone from user where userID = '+share.renterID;
      db.query(query2,function(err,rows,fields){
        if(err)console.log(err);
        share.renterPhone = rows[0].phone;
        resolve();
      })
    })
  }
  async function funs(){
    try{  
    share = await getShare();
      if(share){
        if(share.renterID){
          await getPhone();
        } 
        res.json({success:1,share:share});
      }else{
        res.json({success:2,share:null});
      }
    }catch(err){
      console.log(err);
    }
  }
  funs();
})

/*租用车位*/
router.post('/share/:shareID/accept',function(req,res,next){
  if(req.session.userID){
    var shareID = req.params.shareID;
    var renterID = req.session.userID;
    function getShare(){
      return new Promise(function(resolve,reject){
        var query2 = 'select borrowerID,position from share where shareID = '+shareID;
        db.query(query2,function(err,rows,fields){
          resolve(rows[0]);
        })
      })
    }
    async function funs(){
      let share = await getShare();
      var borrowerID = share.borrowerID;
      if(borrowerID == renterID){
        res.json({success:3,message:"不能租用自己的车位"});
      }else{
        var msgContent = "您位于"+share.position+"的车位已被租用";
        var query3 = 'update share set renterID = '+renterID+',state = 1 where shareID ='+shareID;
        var query4 = 'insert into message(receiveID,msgTitle,msgContent,sendTime) values('+borrowerID+',\"系统通知\",\"'+msgContent+'\",NOW())';
        let docs = [query3,query4];
        let promises = docs.map((doc)=>{
          return new Promise(function(resolve,reject){
            db.query(doc,function(err,rows,fields){
              resolve();
            })
          })
        })
        let results = await Promise.all(promises);
        res.json({success:1,message:null});
      }
    }
    funs();
  }else{
    res.json({success:2,message:"尚未登录"})
  }
})

/*取消车位*/
router.post('/share/:shareID/cancle',function(req,res,next){
  var shareID = req.params.shareID;
  var query = 'update share set state = 3 where shareID = '+shareID;
  db.query(query,function(err,rows,fields){
    res.json({success:1});
  })
})

/*完成并评价*/
router.post('/share/:shareID/windup',function(req,res,next){
  var shareID = req.params.shareID;
  var stars = req.body.stars;
  var query1 = 'select borrowerID from share where shareID = '+shareID;
  function getShare(){
    return new Promise(function(resolve,reject){
      db.query(query1,function(err,rows,fields){
        resolve(rows[0]);
      })
    })
  }
  async function funs(){
    var share = await getShare();
    var borrowerID = share.borrowerID;
    var userID = req.session.userID;
    var docs;
    var msgContent = "您的车单已被结束租用，最终评分为："+stars+"星。";
    var query1 = 'update user set credit = credit*1.05 where userID ='+userID;
    var query2 = 'update user set credit = credit*(0.8 +'+ stars+'/10) where userID ='+ borrowerID;
    var query5 = 'update user set credit = credit*0.95 where userID ='+userID;
    var query3 = 'update share set state =2,stars = '+stars+' where shareID = '+shareID;
    var query4 = 'insert into message(receiveID,msgTitle,msgContent,sendTime) values('+borrowerID+',\"系统通知\",\"'+msgContent+'\",NOW())';
    if(stars>2){
      docs = [query1,query2,query3,query4];
    }else if(stars == 1){
      docs = [query5,query2,query3,query4];
    }else{
      docs = [query3,query4];
    }
    let promises = docs.map((doc)=>{
      return new Promise(function(resolve,reject){
        db.query(doc,function(err,rows,fields){
          if(err)console.log(err);
          resolve();
        })
      })
    })
    let results = await Promise.all(promises);
    res.json({success:1,message:null});
  }
  if(req.session.userID){
    funs();
  }else{
    res.json({success:2,message:"尚未登陆"})
  }
})

/*提交申诉*/
router.post('/share/:shareID/appeal',function(req,res,next){
  var shareID = req.params.shareID;
  var userID = req.session.userID;
  var apContent = req.body.apContent;
  var query = 'insert into appeal(userID,shareID,apContent,apState) values('+userID+','+shareID+',\"'+apContent+'\",false)';
  db.query(query,function(err,rows,fields){
    if(err)console.log(err);
    res.json({success:1});
  })
})

/*个人中心*/
router.get('/userCenter',function(req,res,next){
  if(req.session.userID){
    var userID = req.session.userID;
    var query = 'select * from user where userID = '+userID;
    db.query(query,function(err,rows,fields){
      console.log(rows);
      res.json({success:1,user:rows[0]});
    })
  }else{
    res.json({success:2,message:"尚未登录"})
  }
})

/*已发布车位*/
router.get('/borrowed',function(req,res,next){
  if(req.session.userID){
    var userID = req.session.userID;
    var query = 'select * from share where borrowerID ='+userID+' order by beginTime';
    db.query(query,function(err,rows,fields){
      var shares = rows;
      shares.map((share) => {
        share.beginTimeString = share.beginTime.format("yyyy-MM-dd hh:mm:ss");
      })
      shares.map((share) => {
        share.endTimeString = share.endTime.format("yyyy-MM-dd hh:mm:ss");
      })
      res.json({success:1,message:null,shares:shares});
    })
  }else{
    res.json({success:2,message:"尚未登录"});
  }
})

/*已租用车位*/
router.get('/rented',function(req,res,next){
  if(req.session.userID){
    var userID = req.session.userID;
    var query1 = 'select shareID,position,beginTime,endTime,state,cost,more,borrowerID,stars,nickname as borrowerName,credit,phone as borrowerPhone from share inner join user on share.borrowerID = user.userID where renterID ='+userID+' order by beginTime';
    db.query(query1,function(err,rows,fields){
      if(err)console.log(err);
      var shares = rows;
      shares.map((share) => {
        share.beginTimeString = share.beginTime.format("yyyy-MM-dd hh:mm:ss");
      })
      shares.map((share) => {
        share.endTimeString = share.endTime.format("yyyy-MM-dd hh:mm:ss");
      })
      console.log(shares);
      res.json({success:1,message:null,shares:shares});
    })
  }else{
    res.json({success:2,message:"尚未登录"})
  }
})

/*修改资料*/
router.post('/userCenter/modify',function(req,res,next){
  var userID = req.session.userID;
  var query1 = 'select nickname,password,phone from user where userID = '+userID;
  db.query(query1,function(err,rows,fields){
    var newNickname = rows[0].nickname;
    var newPassword = rows[0].password;
    var newPhone = rows[0].phone;
    if(req.body.newNickname) newNickname = req.body.newNickname;
    if(req.body.newPassword){
      newPassword = req.body.newPassword;
      var hash = crypto.createHash('md5');
      hash.update(newPassword);
      newPassword = hash.digest('hex');
    } 
    if(req.body.newPhone) newPhone = req.body.newPhone;
    console.log(newNickname,newPassword,newPhone);
    var query2 = 'update user set password = '+mysql.escape(newPassword)+',nickname = '+mysql.escape(newNickname)+',phone = '+mysql.escape(newPhone)+'where userID ='+userID;
    db.query(query2,function(err,rows,fields){
      if(err)console.log(err);
      res.json({success:1});
    })
  })
})

/*管理主页*/
router.get('/admin',function(req,res,next){
  if(!req.session.adminLogin){
    res.redirect('/adminLogin');
  }else{
    var query = 'select appealID,userID,apContent from appeal where apstate = false';
    db.query(query,function(err,rows,fields){
      if(err)console.log(err);
      res.render('admin',{appeals:rows});
    })
  }
})

/*申诉详情*/
router.get('/appeal/:appealID',function(req,res,next){
  if(!req.session.adminLogin){
    res.redirect('/adminLogin');
  }else{
    var appealID = req.params.appealID;
    var query1 = 'select * from appeal where appealID ='+appealID;
    db.query(query1,function(err,rows,fields){
      console.log(rows[0])
      var appeal = rows[0];
      var query2 = 'select shareID,position,beginTime,endTime,cost,borrowerID,renterID,nickname as borrowerName,credit as borrowerCredit from share inner join user on share.borrowerID = user.userID where shareID ='+ appeal.shareID;
      db.query(query2,function(err,rows,fields){
        share = rows[0];
        share.beginTimeString = share.beginTime.format("yyyy-MM-dd hh:mm:ss");
        share.endTimeString = share.endTime.format("yyyy-MM-dd hh:mm:ss");
        res.render('appeal',{success:1,appeal:appeal,share:rows[0]})
      })
    })
  }
})

/*用户详情*/
router.get('/userInfor/:userID',function(req,res,next){
  if(!req.session.adminLogin){
    res.redirect('/adminLogin');
  }else{
    var userID = req.params.userID;
    var appealID = req.query.appealID;  
    async function funs(){
      var query1 = 'select nickname,phone from user where userID = '+userID;
      var query2 = 'select count(*) from share where borrowerID = '+userID;
      var query3 = 'select count(*) from share where renterID = '+userID;
      var query4 = 'select count(*) from share where stars >3 and borrowerID = '+userID;
      var query5 = 'select count(*) from share where stars >3 and renterID = '+userID;
      var query6 = 'select * from share where borrowerID = '+ userID+' or renterID ='+userID;
      let docs = [query1,query2,query3,query4,query5,query6];
      let promises = docs.map((doc)=>{
        return new Promise(function(resolve,reject){
          db.query(doc,function(err,rows,fields){
            if(err) console.log(err);
            resolve(rows);
          })
        })
      })
      var results = await Promise.all(promises);
      if(results[1][0]["count(*)"] == 0){
        borrowRate = 0;
      }else{
        borrowRate = results[3][0]["count(*)"]/results[1][0]["count(*)"];
      }
      if(results[2][0]["count(*)"] == 0){
        rentRate = 0;
      }else{
        rentRate = results[4][0]["count(*)"]/results[2][0]["count(*)"];
      }
      res.render('userInfor',{appealID:appealID,userID:userID,nickname:results[0][0].nickname,phone:results[0][0].phone,borrowNum:results[1][0]["count(*)"],rentNum:results[2][0]["count(*)"],borrowRate:borrowRate,rentRate:rentRate,shares:results[5]});
    }
    funs();

  }
})

/*申诉处理*/
router.post('/appeal/:appealID',function(req,res,next){
  if(!req.session.adminLogin){
    res.redirect('/adminLogin');
  }else{
    var apResult = req.body.apResult;
    var appealID = req.params.appealID;
    var shareID = req.query.shareID;
    var renterID = req.query.userID;
    console.log("apresult",apResult);
    if(apResult){
      console.log(apResult,appealID,shareID,renterID);
      var query2 = 'select borrowerID,position from share where shareID = '+shareID;
      function getShare(){
        return new Promise(function(resolve,reject){
          db.query(query2,function(err,rows,fields){
            if(err)console.log(err);
            resolve(rows[0]);
          })
        }) 
      }
      async function funs(){
        let share = await getShare();
        console.log(share);
        var borrowerID = share.borrowerID;
        var position = share.position;
        var borrowerMsgContent = "您好，您发布的位于"+position+"的车位因用户申诉被取消";
        var renterMsgContent = "您好，您对位于"+position+"的车位使用申诉已通过";
        var query3 = 'update share set state = 3 where shareID ='+shareID;
        var query4 = 'update user set credit = credit*0.4 where userID = '+borrowerID;
        var query6 = 'insert into message(receiveID,msgTitle,msgContent,sendTime) values('+borrowerID+',\"系统通知\",\"'+borrowerMsgContent+'\",NOW())';
        var query7 = 'insert into message(receiveID,msgTitle,msgContent,sendTime) values('+renterID+',\"系统通知\",\"'+renterMsgContent+'\",NOW())';
        var query8 = 'update appeal set apResult = true,apState = true where appealID = '+appealID;
        let docs = [query3,query4,query6,query7,query8];
        let promises = docs.map((doc)=>{
          return new Promise(function(resolve,reject){
            db.query(doc,function(err,rows,fields){
              if(err)console.log(err);
              resolve();
            })
          })
        })
        let results = await Promise.all(promises);
        res.redirect('/admin');
      }
      funs();
    }else{
      async function funs(){
        var msgContent = "您好，您的申诉被驳回";
        var query1 = 'update appeal set apState = true,apResult = false where appealID = '+appealID;
        var query2 = 'insert into message(receiveID,msgTitle,msgContent,sendTime) values('+renterID+',\"系统通知\",\"'+msgContent+'\",NOW())';
        let docs = [query1,query2];
        let promises = docs.map((doc)=>{
          return new Promise(function(resolve,reject){
            db.query(doc,function(err,rows,fields){
              if(err)console.log(err);
              resolve();
            })
          })
        })
        let results = await Promise.all(promises);
        res.redirect('/admin')
      }
      funs();
    }
  }
})  

/*管理员身份验证*/
router.get('/adminLogin',function(req,res,next){
  res.render('adminLogin',{message:""});
})

router.post('/doAdminLogin',function(req,res,next){
  var adminName = req.body.adminName;
  var password = req.body.password;
  var hash = crypto.createHash('md5');
  hash.update(password);
  password = hash.digest('hex');
  var query = 'select adminID from admin where adminName = '+mysql.escape(adminName)+' and password = '+mysql.escape(password);
  db.query(query,function(err,rows,fields){
    if(err)console.log(err);
    if(rows[0]){
      req.session.adminLogin = true;
      res.redirect('/admin')
      return;
    }else{
      req.session.adminLogin = false;
      res.render('adminLogin',{message:"帐号或密码错误，请重试"})
    }
  })
})

/*查看系统情况*/
router.get('/situation',function(req,res,next){
  if(!req.session.adminLogin){
    res.redirect('/adminLogin');
  }else{
    var query1 = 'select count(*) from user';//总用户数
    var query2 = 'select count(*) from share where state = 2';//已完成车单数目
    var query3 = 'select count(*) from share where state = 0';//当前系统发布的可用车单数
    var query4 = 'select sum(cost) from share where state = 2';//已完成的交易总额
    var query5 = 'SELECT sum(cost) FROM share WHERE beginTime>date_add(now(),interval -1 month) and state = 2';//本月完成的交易总额
    var query6 = 'select userID,nickname,credit from user where credit < 60';
    
    async function funs(){
      var docs = [query1,query2,query3,query4,query5,query6];
      let promises = docs.map((doc)=> {
        return new Promise(function(resolve,reject){
          db.query(doc,function(err,rows,fields){
            if(err)console.log(err);
            resolve(rows);
          })
        })
      })
      var results = await Promise.all(promises);
      console.log(results);
      res.render('situation',{totalUserNum:results[0][0]["count(*)"],endShareNum:results[1][0]["count(*)"],avaiShareNum:results[2][0]["count(*)"],totalCost:results[3][0]["sum(cost)"],monthCost:results[4][0]["sum(cost)"],badusers:results[5]});
    }
    funs();
  }
})

/*查看用户记录*/
router.get('/baduser/:baduserID',function(req,res,next){
  if(!req.session.adminLogin){
    res.redirect('/adminLogin');
  }else{
    var userID = req.params.baduserID;
    async function funs(){
      var query1 = 'select nickname,phone from user where userID = '+userID;
      var query2 = 'select count(*) from share where borrowerID = '+userID;
      var query3 = 'select count(*) from share where renterID = '+userID;
      var query4 = 'select count(*) from share where stars >3 and borrowerID = '+userID;
      var query5 = 'select count(*) from share where stars >3 and renterID = '+userID;
      let docs = [query1,query2,query3,query4,query5];
      let promises = docs.map((doc)=>{
        return new Promise(function(resolve,reject){
          db.query(doc,function(err,rows,fields){
            if(err) console.log(err);
            resolve(rows);
          })
        })
      })
      var results = await Promise.all(promises);
      if(results[1][0]["count(*)"] == 0){
        borrowRate = 0;
      }else{
        borrowRate = results[3][0]["count(*)"]/results[1][0]["count(*)"];
      }
      if(results[2][0]["count(*)"] == 0){
        rentRate = 0;
      }else{
        rentRate = results[4][0]["count(*)"]/results[2][0]["count(*)"];
      }
      res.render('baduser',{userID:userID,nickname:results[0][0].nickname,phone:results[0][0].phone,borrowNum:results[1][0]["count(*)"],rentNum:results[2][0]["count(*)"],borrowRate:borrowRate,rentRate:rentRate});
    }
    funs();
  }
})

/*发送警告提示*/
router.get('/baduser/:userID/warning',function(req,res,next){
  if(!req.session.adminLogin){
    res.redirect('/adminLogin');
  }else{
    var userID = req.params.userID;
    var msgContent = "警告：您的信誉过低，请诚信交易避免差评。信誉低于一定水平帐号将会被封停。";
    var query = 'insert into message(receiveID,msgTitle,msgContent,sendTime) values('+userID+',\"系统警告\",\"'+msgContent+'\",NOW())';
    db.query(query,function(err,rows,fields){
      res.redirect('/situation');
    })
  }
})

/*封停用户*/
router.get('/baduser/:userID/freeze',function(req,res,next){
  if(!req.session.adminLogin){
    res.redirect('/adminLogin');
  }else{
    var userID = req.params.userID;
    var query = 'update user set usable = 0 where userID = '+userID;
    db.query(query,function(err,rows,fields){
      res.redirect('/situation');
    })
  }
})

/*发布公告*/
router.get('/CNotice',function(req,res,next){
  if(req.session.adminLogin){
    res.render('createNotice');
  }else{
    res.redirect('/adminLogin');
  }
})

router.post('/createNotice',function(req,res,next){
  if(req.session.adminLogin){
    var noticeTitle = req.body.noticeTitle;
    var noticeContent = req.body.noticeContent;
    var query = 'insert into notice(noticeTitle,noticeContent,noticeTime) values(\"'+noticeTitle+'\",\"'+noticeContent+'\",NOW())';
    db.query(query,function(err,rows,fields){
      res.redirect('/admin');
    })
  }else{
    res.redirect('/adminLogin');
  }
  
})

module.exports = router;
