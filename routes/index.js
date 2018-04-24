var express = require('express');
var router = express.Router();
var db = require('./../database');
var crypto = require('crypto');
var mysql = require('mysql');

/*注册*/
router.post('/register',function(req,res,next){
  var userName = req.body.userName;
  var password = req.body.password;
  var hash = crypto.createHash('md5');
  hash.update(password);
  password = hash.digest('hex');
  var query1 = 'select * from user where userName = \"'+userName+'\"';
  var query2 = 'insert into user set userName = '+mysql.escape(userName)+',password = '+mysql.escape(password)+',nickname = \"user'+mysql.escape(userName)+'\",balance = 0,credit = 100';
  db.query(query1,function(err,rows,fields){
    if(err)console.log(err);
    if(rows[0]){
      res.json({success:0,message:'用户已存在'});
    }else{
      db.query(query2,function(err,rows,fields){
        if(err)console.log(err);
        res.json({success:1})
      })
    }
  })
})

router.get('/login', function (req, res) {
  res.render('login')
})

/*登录*/
router.post('/login',function(req,res,next){
  var userName = req.body.userName;
  var password = req.body.password;
  var hash = crypto.createHash('md5');
  hash.update(password);
  password = hash.digest('hex');
  var query = 'select userID,nickname from user where userName ='+mysql.escape(userName)+' and password = '+mysql.escape(password);
  db.query(query,function(err,rows,fields){
    if(rows[0]){
      req.session.userID = rows[0].userID;
      req.session.userName = userName;
      req.session.nickname = rows[0].nickname;
      res.json({success:1})
      console.log(req.session)
    }else{
      res.json({success:0,message:'用户名或密码错误'});
    }
  })
})

/*注销*/
router.get('/logout',function(req,res,next){
  req.session.userID = '';
  req.session.userName = '';
  res.json({success:1});
})

/*大厅*/
router.get('/',function(req,res,next){
  var login = false;
  var query1 = 'select shareID,position,beginTime,endTime,cost from share where state = 0';
  if(req.session.userID){
    login = true;
    var lastTime = req.query.lastTime;
    var userID = req.session.userID;
    var query2 = 'select count(*) from message where receiveID = '+userID+' and sendTime>'+lastTime;
    var query3 = 'select count(*) from notice where noticeTime>'+lastTime;
    async function funs(){
      docs = [query1,query2,query3];
      let promises = docs.map((doc)=>{
        return new Promise(function(resolve,reject){
          db.query(doc,function(err,rows,next){
            resolve(rows);
          })
        })   
      })
      let results = await Promise.all(promises);
      var number = results[1][0]["count(*)"]+results[2][0]["count(*)"];
      res.json({success:1,login:true,shares:results[0],newMsgMum:number})
    }
    funs();
  }else{
    db.query(query1,function(err,rows,next){
      if(err) console.log(err);
      res.json({success:1,login:false,shares:rows});
    })
  }
})
/*搜索结果*/
router.post('/search',function(req,res,next){
  var keyWord = req.body.keyWord;
  var beginTime = req.body.beginTime;
  var endTime = req.body.endTime;
  var query = 'select * from share where state=0 and position like \'\%'+keyWord+'\%\' and beginTime<=\"'+beginTime+'\" and endTime>=\"'+endTime+'\"';
  db.query(query,function(err,rows,fields){
    if(err)console.log(err);
    res.json({success:1,shares:rows})
  })
})

/*消息列表*/
router.get('/msgList',function(req,res,next){
  var userID = req.session.userID;
  var lastTime = req.query.lastTime;
  var query1 = 'select * from notice where noticeTime >='+lastTime;
  var query2 = 'select * from message where receiveID = '+userID;
  async function getMsg(){
    let docs = [query1,query2];
    let promises = docs.map((doc)=>{
      return new Promise(function(resolve,reject){
        db.query(doc,function(err,rows,fields){
          resolve(rows);
        })
      })
    })
    let msgs = await Promise.all(promises);
    res.json({success:1,notices:msgs[0],messages:msgs[1]})
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

/*加入黑名单*/
router.post('/message/:messageID/pullInBlack',function(req,res,next){
  var messageID = req.params.messageID;
  var userID = req.session.userID;
  var query1 = 'select senderID,senderName from message where messageID = '+messageID;
  var query2 = 'insert into blacklist set userID ='+userID+',pulledID ='+pulledID+',pulledName ='+pulledName;
  db.query(query1,function(err,rows,fields){
    var pulledID = rows[0].senderID;
    var pulledName = rows[0].senderName;
    db.query(query2,function(err,rows,fields){
      res.json({success:1});
    })
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

/*发送消息*/
router.post('/sendMsg',function(req,res,next){
  var receiveID = req.query.receiveID;
  var senderID = req.session.userID;
  var senderName = req.session.userName;
  var msgTitle = req.body.msgTitle;
  var msgContent = req.body.msgContent;
  var query1 = 'select blacklistID from blacklist where userID = '+receiveID+' and pulledID ='+senderID;
  var query2 = 'insert into message set receiveID = '+receiveID+',senderID = '+senderID+',senderName = \"'+senderName+'\",msgTitle = \"'+msgTitle+'\",msgContent = \"'+msgContent+'\",msgType = 1,sendTime = NOW()';
  async function ifBlack(){
    db.query(query1,function(err,rows,fields){
      return new Promise(function(resolve,reject){
        if(err)console.log(err);
        resolve(rows[0]);
      }) 
    })
  }
  async function sendMsg(){
    db.query(query2,function(err,rows,fields){
      return new Promise(function(resolve,reject){
        if(err)console.log(err);
        resolve();
      })
    })
  }
  async function funs(){
    var doIfBlack = await ifBlack();
    if(doIfBlack){
      res.json({success:0,message:"发送失败，已被对方加入黑名单"});
    }else{
      var doSendMsg = await sendMsg();
      res.json({success:1});
    }
  }
  funs();
})

/*发布车位*/
router.post('/createShare',function(req,res,next){
  var renderID = req.session.userID
  var renderName = req.session.nickname;
  var position = req.body.position;
  var beginTime = req.body.beginTime;
  var endTime = req.body.endTime;
  var cost = req.body.cost;
  
  function getCredit(){
    return new Promise(function(resolve,reject){
      var query1 = 'select credit from user where userID = '+ renderID;
      db.query(query1,function(err,rows,fields){
        resolve(rows[0]);
      })
    }) 
  }
  function createShare(renderCredit){
    return new Promise(function(resolve,reject){
      var query2 = 'insert into share set renderID = '+renderID+',renderName = \"'+renderName+'\",renderCredit = '+renderCredit+',position = \"'+position+'\",beginTime =\"'+beginTime+'\",endTime =\"'+endTime+'\",state = 0,cost = '+cost;
      db.query(query2,function(err,rows,fields){
        if(err) console.log(err);
        resolve();
      })
    })
    
  }
  async function funs(){
    var credit = await getCredit();
    var renderCredit = credit.credit;
    var resulet = await createShare(renderCredit);
    res.json({success:1});
  }
  funs();
})

/*车位详情*/
router.get('/share/:shareID',function(req,res,next){
  var shareID = req.params.shareID;
  var userID = req.session.userID;
  var query1 = 'select * from share where shareID ='+ shareID;
  db.query(query1,function(err,rows,fields){
    res.json({success:1,share:rows[0],userID:userID});
  })
})

/*租用车位*/
router.post('/share/:shareID/accept',function(req,res,next){
  if(req.session.userID){
    var shareID = req.params.shareID;
    var borrowerID = req.session.userID;
    var query1 = 'select balance from user where userID ='+borrowerID;
    var query2 = 'select renderID,cost,position from share where shareID = '+shareID;
    async function getBalance(){
      return new Promise(function(resolve,reject){
        db.query(query1,function(err,rows,fields){
          console.log(rows);
          resolve(rows[0]);  
        })
      })
    }
    async function getShare(){
      return new Promise(function(resolve,reject){
        db.query(query2,function(err,rows,fields){
          console.log(rows);
          resolve(rows[0]);
        })
      })
    }
    async function funs(){
      let Balance = await getBalance();
      let share = await getShare();
      var cost = share.cost;
      var balance = Balance.balance;
      if(balance>=cost){
        var renderID = share.renderID;
        var msgContent = "您位于"+share.position+"的车位已被租用";
        var query3 = 'update share set borrowerID = '+borrowerID+',state = 1 where shareID ='+shareID;
        var query4 = 'update user set balance = balance-'+cost+' where userID = '+borrowerID;
        var query5 = 'insert into message(receiveID,msgTitle,msgContent,msgType,sendTime) values('+renderID+',\"系统通知\",\"'+msgContent+'\",0,NOW())';
        let docs = [query3,query4,query5];
        let promises = docs.map((doc)=>{
          return new Promise(function(resolve,reject){
            db.query(doc,function(err,rows,fields){
              if(err)console.log(err);
              resolve();
            })
          })
        })
        let results = await Promise.all(promises);
        res.json({success:1})
      }else{
        res.json({success:0,message:"余额不足"});
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
  var query1 = 'select renderID,cost from share where shareID = '+shareID;
  function getShare(){
    return new Promise(function(resolve,reject){
      db.query(query1,function(err,rows,fields){
        resolve(rows[0]);
      })
    })
  }
  async function funs(){
    var share = await getShare();
    var cost = share.cost;
    var renderID = share.renderID;
    console.log(share);
    var msgContent = "您的车单已被结束租用，最终评分为："+stars+"星";
    var query2 = 'update user set balance = balance +'+cost+',credit = credit*('+(0.4+stars/5)+') where userID = '+renderID;
    var query3 = 'update share set state =2,stars = '+stars+' where shareID = '+shareID;
    var query4 = 'insert into message(receiveID,msgTitle,msgContent,msgType,sendTime) values('+renderID+',\"系统通知\",\"'+msgContent+'\",0,NOW())';
    let docs = [query2,query3,query4];
    let promises = docs.map((doc)=>{
      return new Promise(function(resolve,reject){
        db.query(doc,function(err,rows,fields){
          if(err)console.log(err);
          resolve();
        })
      })
    })
    let results = await Promise.all(promises);
    res.json({success:1});
  }
  funs();
})

/*提交申诉*/
router.post('/share/:shareID/appeal',function(req,res,next){
  var shareID = req.params.shareID;
  var userID = req.session.userID;
  var apContent = req.body.apContent;
  var query = 'insert into appeal(userID,shareID,apContent,apState) values('+userID+','+shareID+','+apContent+',false)';
  db.query(query,function(err,rows,fields){
    res.json({success:1});
  })
})

/*个人中心*/
router.get('/userCenter',function(req,res,next){
  if(req.session.userID){
    var userID = req.session.userID;
    var query1 = 'select * from user where userID = '+userID;
    var query2 = 'select * from share where renderID ='+userID+' or borrowerID = '+userID;
    async function funs(){
      let docs = [query1,query2];
      let promises = docs.map((doc)=>{
        return new Promise(function(resolve,reject){
          db.query(doc,function(err,rows,fields){
            resolve(rows);
          })
        })
      })
      let resulets = await Promise.all(promises);
      res.json({success:1,user:resulets[0][0],shares:resulets[1]});
    }
  }else{
    res.json({success:2,message:"尚未登录"})
  }
})

/*修改资料*/
router.post('/userCenter/modify',function(req,res,next){
  var userID = req.session.userID;
  var newPassword = req.body.newPassword;
  var hash = crypto.createHash('md5');
  hash.update(newPassword);
  newPassword = hash.digest('hex');
  var newNickname = req.body.newNickname;
  var query = 'update user set password = '+mysql.escape(newPassword)+',nicename = '+mysql.escape(newNickname);
  db.query(query,function(err,rows,fields){
    res.json({success:1});
  })
})

/*查看黑名单*/
router.get('/userCenter/blacklist',function(req,res,next){
  var userID = req.session.userID;
  var query = 'select * blacklist where userID ='+userID;
  db.query(query,function(err,rows,fields){
    res.json({success:1,blacklists:rows});
  })
})

/*修改黑名单*/
router.post('/userCenter/blacklist/delete',function(req,res,next){
  var blacklistIDs = req.body.blacklistIDs;
  var query = 'delete from blacklist where blacklistID in '+blacklistIDs;
  db.query(query,function(err,rows,fields){
    res.json({success:1});
  })
})

/*管理主页*/
router.get('/admin',function(req,res,next){
  var query = 'select appealID,userID,apContent from appeal where apstate = false';
  db.query(query,function(err,rows,fields){
    if(err)console.log(err);
    res.render('admin',{appeals:rows});
  })
})

/*申诉详情*/
router.get('/appeal/:appealID',function(req,res,next){
  var appealID = req.params.appealID;
  var query1 = 'select * from appeal where appealID ='+appealID;
  db.query(query1,function(err,rows,fields){
    var appeal = rows[0];
    var query2 = 'select * from share where shareID = '+appeal.shareID;
    db.query(query2,function(err,rows,fields){
      console.log(appeal)
      console.log(rows[0])
      res.render('appeal',{success:1,appeal:appeal,share:rows[0]})
    })
  })
})

/*申诉处理*/
router.post('/appeal/:appealID',function(req,res,next){
  var apResult = req.query.apResult;
  var appealID = req.params.appealID;
  var shareID = req.query.shareID;
  var borrowerID = req.query.userID;
  if(apResult){
    console.log(apResult,appealID,shareID,borrowerID);
    var query2 = 'select renderID,cost,position from share where shareID = '+shareID;
    var query3 = 'update share set state = 3 where shareID ='+shareID;
    var query4 = 'update user set balance = balance - '+cost+',credit = credit*0.5 where userID = '+renderID;
    var query5 = 'update user set balance = balance + '+cost+' where userID = '+borrowerID;
    var query6 = 'insert into message(receiveID,msgTitle,msgContent,msgType,sendTime) values('+renderID+',\"系统通知\",'+renderMsgContent+',0,NOW())';
    var query7 = 'insert into message(receiveID,msgTitle,msgContent,msgType,sendTime) values('+borrowerID+',\"系统通知\",'+borrowerMsgContent+',0,NOW())';
    var query8 = 'update appeal set apResult = true,apState = true where appealID = '+appealID;

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
      var renderID = share.renderID;
      var cost = share.cost;
      var position = share.position;
      var renderMsgContent = "您好，您发布的位于"+position+"的车位因用户申诉被取消，费用已被退回";
      var borrowerMsgContent = "您好，您对位于"+position+"的车位使用申诉已通过，费用已退回至您的账户";
      let docs = [query3,query4,query5,query6,query7,query8];
      let promises = docs.map((doc)=>{
        return new Promise(function(resolve,reject){
          db.query(doc,function(err,rows,fields){
            if(err)console.log(err);
            resolve();
          })
        })
      })
      let resulets = await Promise.all(promises);
      res.redirect('/admin');
    }
    funs();
  }else{
    async function funs(){
      var msgContent = "您好，您的申诉被驳回";
      var query1 = 'update appeal set apState = true,apResult = false where appealID = '+appealID;
      var query2 = 'insert into message(receiveID,msgTitle,msgContent,msgType,sendTime) values('+borrowerID+',\"系统通知\",\"'+msgContent+'\",0,NOW())';
      let docs = [query1,query2];
      let promises = docs.map((doc)=>{
        return new Promise(function(resolve,reject){
          db.query(doc,function(err,rows,fields){
            if(err)console.log(err);
            resolve();
          })
        })
      })
      let resulets = await Promise.all(promises);
      res.redirect('/admin')
    }
    funs();
  }
})

/*发布公告*/
router.get('/CNotice',function(req,res,next){
  res.render('createNotice');
})

router.post('/createNotice',function(req,res,next){
  var noticeTitle = req.body.noticeTitle;
  var noticeContent = req.body.noticeContent;
  var query = 'insert into notice(noticeTitle,noticeContent,noticeTime) values(\"'+noticeTitle+'\",\"'+noticeContent+'\",NOW())';
  db.query(query,function(err,rows,fields){
    res.redirect('/admin');
  })
})

module.exports = router;