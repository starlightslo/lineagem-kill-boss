require('dotenv').config();

const Discord = require('discord.io');
const BOSS_DATA = require('./boss.json');
const SPECIAL_BOSS_DATA = require('./special-boss.json');
const schedule = require('node-schedule');
const moment = require('moment');
const fs = require('fs');
const NOTICE_TIME = 5;
const LIMIT_TIMES = 3;
const DC_NOTIFY = true;
const BOSS_TEMP_FILE = 'boss.tmp';
const CHANNEL_TEMP_FILE = 'channel.tmp';
const COMMANDS = {
    init: 'INIT',
    help: 'HELP',
    list: 'LIST',
    boss: 'BOSS',
    clearall: 'CLEARALL',
    clear: 'CLEAR',
    kill: 'KILL'
}
const DATETIME_FORMAT = 'yyyy/MM/DD HH:mm:ss';
const INPUT_TIME_FORMAT = 'HHmmss';
const DISPLAY_TIME_FORMAT = 'HH:mm:ss';

const BOSS_LIST = JSON.parse(JSON.stringify(BOSS_DATA));
let bossList = JSON.parse(JSON.stringify(BOSS_DATA));
let sourceChannelID = null;

const updateBossTempFile = () => {
    try {
        fs.writeFileSync(BOSS_TEMP_FILE, JSON.stringify(bossList));
    } catch (err) {
        console.error(err);
    }
}

const updateChannelTempFile = () => {
    try {
        fs.writeFileSync(CHANNEL_TEMP_FILE, sourceChannelID);
    } catch (err) {
        console.error(err);
    }
}

const refreshBossList = () => {
    BOSS_LIST.forEach((originalBoss) => {
        let newBoss = true;
        bossList.forEach((boss) => {
            if (boss.name == originalBoss.name) {
                newBoss = false;
                boss.keys = originalBoss.keys;
                boss.refreshTime = originalBoss.refreshTime;
            }
        });

        if (newBoss) {
            bossList.push(originalBoss);
        }
    });

    updateBossTempFile();
}

// Check is there boss.tmp file
try {
    if (fs.existsSync(BOSS_TEMP_FILE)) {
        // Loading boss from boss.tmp
        bossList = JSON.parse(fs.readFileSync(BOSS_TEMP_FILE, 'utf8'));
        refreshBossList();
    }
} catch (err) {
    console.error(err)
}

// Check is there channel.tmp file
try {
    if (fs.existsSync(CHANNEL_TEMP_FILE)) {
        // Loading default channel from channel.tmp
        sourceChannelID = fs.readFileSync(CHANNEL_TEMP_FILE, 'utf8');
    }
} catch (err) {
    console.error(err)
}

// Init DC BOT
const bot = new Discord.Client({
    token: process.env.TOKEN,
    autorun: true
});

// DC message handler
bot.on('ready', function () {
    console.log('DC Bot Ready.');
});

bot.on('disconnect', function (erMsg, code) {
    console.log('----- Bot disconnected from Discord with code', code, 'for reason:', erMsg, '-----');
    bot.connect();
});

bot.on('message', function (user, userID, channelID, message, event) {
    if (message.toUpperCase() === COMMANDS.init) {
        sourceChannelID = channelID;
        updateChannelTempFile();
        initBot();
        return;
    }

    if (sourceChannelID == null || sourceChannelID != channelID) {
        console.error('no source channel or not equal to channel ID. sourceChannelID: ' + sourceChannelID + ', channelID: ' + channelID);
        return;
    }

    // Check commands
    if (message.toUpperCase() == COMMANDS.help) {
        helpBoss();
        return;
    }

    if (message.toUpperCase() == COMMANDS.list || message.toUpperCase() == COMMANDS.boss) {
        getBoss();
        return;
    }

    if (message.toUpperCase() == COMMANDS.clearall) {
        clearAllBoss();
        return;
    }

    const arr = message.split(' ');

    if (arr[0].toUpperCase() === COMMANDS.kill) {
        killBoss(arr[1], arr[2], arr[3]);
        return;
    }

    if (arr[0].toUpperCase() === COMMANDS.clear) {
        clearBoss(arr[1], false);
        return;
    }
});

const initBot = () => {
    console.info('initBot');
    let message = "Kill-Boss初期化に成功しました"
    if (DC_NOTIFY) sendMessage(message);
}

const helpBoss = (event) => {
    console.info('helpBoss');
    let message = "ようこそ Kill-Boss \r\n\r\n";
    message += "Author：Tony" + " \r\n";

    message += "===============================" + " \r\n";

    message += "サポート命令：help, list(boss), kill, clear, clearall \r\n";

    message += "命令 help \r\n";
    message += "説明： \r\n";
    message += "すべてのコマンドが表示されます。 \r\n\r\n";

    message += "命令： list \r\n";
    message += "説明： \r\n";
    message += "現在のすべてのボス時間を表示します。 \r\n\r\n";

    message += "命令： clear \r\n";
    message += "説明： \r\n";
    message += "clear [BOSS]，ボスは時間をクリアする。 \r\n\r\n";

    message += "命令： kill \r\n";
    message += "説明： \r\n";
    message += "kill [BOSS] [時間] [コメント]，ボスを殺す時間を記録する。 \r\n\r\n";

    message += "命令： clearall \r\n";
    message += "説明： \r\n";
    message += "すべてのボス時間をクリアする。 \r\n\r\n";

    if (DC_NOTIFY) sendMessage(message);
}

const getBoss = () => {
    console.info('getBoss');
    let message = "時間 \t\t\t ボス \t\t\t\t\t\t\t コメント \n";
    let tempBossList = JSON.parse(JSON.stringify(bossList));
    const sortBossList = [];
    for (let i = 0 ; i < bossList.length ; i++) {
        let index;
        let latestBoss = null;
        let minDiffTime = 99999;
        for (let j = 0 ; j < tempBossList.length ; j++) {
            if (latestBoss == null) {
                index = j;
                latestBoss = JSON.parse(JSON.stringify(tempBossList[j]));
            }

            const bossTime = moment(tempBossList[j].time, DATETIME_FORMAT);
            if (!bossTime.isValid()) continue;

            const diffTime = bossTime.diff(moment(), 'minutes');
            if (diffTime < minDiffTime) {
                minDiffTime = diffTime;
                index = j;
                latestBoss = JSON.parse(JSON.stringify(tempBossList[j]));
            }
        }
        tempBossList.splice(index, 1);
        sortBossList.push(latestBoss);
    }

    sortBossList.forEach((boss) => {
        message += bossInfo(boss);
    })
    if (DC_NOTIFY) sendMessage(message);
}

const clearAllBoss = (event) => {
    console.info('clearAllBoss');
    bossList = JSON.parse(JSON.stringify(BOSS_DATA));
    updateBossTempFile();
    let message = "すべてのボスデータをクリアしました";
    if (DC_NOTIFY) sendMessage(message);
}

const killBoss = (bossName, time, memo) => {
    console.info('killBoss->bossName: ' + bossName + ', time: ' + time + ', memo: ' + memo);
    if (bossName === undefined) return;
    if (time === undefined) time = moment().format(INPUT_TIME_FORMAT);
    if (isNaN(time)) {
        memo = time;
        time = moment().format(INPUT_TIME_FORMAT);
    };
    if (time.length !== 4 && time.length !== 6 && time != '99') return;

    if (time.length === 4) time += '00';
    const momentTime = moment(time, INPUT_TIME_FORMAT);

    let message = '';
    bossList.forEach((boss) => {
        if (
            boss.name.toLowerCase() == bossName.toLowerCase()
            || boss.keys.find((key) => key.toLowerCase() == bossName.toLowerCase()) !== undefined
        ) {
            if (time == 99) {
                boss.time = moment(boss.time, DATETIME_FORMAT).add(boss.refreshTime, 'hour').format(DATETIME_FORMAT);
                let lastMemoChar = '';
                if (boss.memo.substring(0, 3) == 'スルー') {
                    lastMemoChar = boss.memo.slice(-1);
                    if (!isNaN(lastMemoChar)) {
                        lastMemoChar = Number(lastMemoChar) + 1;
                    } else {
                        lastMemoChar = '2';
                    }
                }
                boss.memo = 'スルー' + lastMemoChar;
            } else {
                boss.time = momentTime.add(boss.refreshTime, 'hour').format(DATETIME_FORMAT)
                boss.memo = (memo !== undefined ? memo : '');
            }
            message = bossInfo(boss);
            return;
        }
    });
    updateBossTempFile();
    if (DC_NOTIFY) sendMessage(message);
}

const clearBoss = (bossName, auto) => {
    console.info('clearBoss->bossName: ' + bossName);
    let message = '';
    bossList.forEach((boss) => {
        if (
            boss.name.toLowerCase() == bossName.toLowerCase()
            || boss.keys.find((key) => key.toLowerCase() == bossName.toLowerCase()) !== undefined
        ) {
            if (auto) {
                boss.memo = 'Lost (' + moment(boss.time, DATETIME_FORMAT).format(DATETIME_FORMAT) + ')';
                boss.time = null;
                message = `【System】Lost ${boss.name}`;
            } else {
                boss.time = null;
                boss.memo = '';
                message = `クリア ${boss.name}`;
            }
            return;
        }
    });
    updateBossTempFile();
    if (DC_NOTIFY) sendMessage(message);
}

const bossInfo = (boss) => {
    let message = (boss.time !== null ? transformToDisplayTime(boss.time) + ' \t ' : '- \t\t\t\t\t ') + boss.name;
    if (boss.memo !== null && boss.memo.length > 0) {
        message += (' \t\t ' + boss.memo);
    }
    return message + ' \n';
}

const sendMessage = (message) => {
    try {
        if (sourceChannelID) {
            bot.sendMessage({
                to: sourceChannelID,
                message
            });
        }
    } catch (err) {
        console.error('Send message with error: ', err);
    }
}

const bossNotice = (boss) => {
    console.info('bossNotice->boss: ' + boss);
    const message = `@here 【通知】${boss.name} ${transformToDisplayTime(boss.time)} ${((boss.memo != null && boss.memo.length > 0) ? '【' + boss.memo + '】' : '')} に出現する`;
    sendMessage(message);
}

const transformToDisplayTime = (time) => {
    const momentDate = moment(time, DATETIME_FORMAT);
    if (momentDate.isValid()) {
        return momentDate.format(DISPLAY_TIME_FORMAT);
    }
    return time;
}

// Define scheduler
schedule.scheduleJob('0 */1 * * * *', function () {
    const now = moment();
    // Check normal boss
    bossList.forEach((boss) => {
        // Check is boss time
        if (boss.time !== null && now.diff(moment(boss.time, DATETIME_FORMAT), 'minutes') === (1 - NOTICE_TIME)) {
            bossNotice(boss);
        }

        // Check is exceed boss time
        if (boss.time !== null) {
            const diffHours = now.diff(moment(boss.time, DATETIME_FORMAT), 'hours');
            if (diffHours >= boss.refreshTime * LIMIT_TIMES) {
                console.info(boss.name + ' diff hour more than (' + LIMIT_TIMES + ') times: ' + diffHours);
                clearBoss(boss.keys[0], true);
            }
        }
    });

    // Check special boss
    SPECIAL_BOSS_DATA.forEach((boss) => {
        boss.time.forEach((time) => {
            if (now.diff(moment(time, 'HH:mm'), 'minutes') === (1 - NOTICE_TIME)
                && boss.weeks.indexOf(now.weekday()) > -1) {
                bossNotice({
                    name: boss.name,
                    time
                });
            }
        })
    });
});
