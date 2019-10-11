const {
  readdirSync
} = require('fs')
const {
  join
} = require('path')

const filenameRegex = /(.+?)\.js$/

const {
  ReactCommand,
  ReactInterface
} = require('cyclone-engine')

const links = {
  pingIcon: 'https://i.imgur.com/SCCJ8qs.gif',
  prefixIcon: 'https://i.imgur.com/GT1v7rD.png',
  inviteIcon: 'https://i.imgur.com/dd1G7Cw.png'
}
/**
 * Require every js file in a directory and push them to an array.
 * @param   {String} path The directory to read.
 * @returns {*[]}         The resulting array.
 */
function requireDirToArray (path) {
  const content = []
  const files = readdirSync(path)

  for (let i = 0; i < files.length; i++) {
    if (files[i] !== 'index.js') content.push(require(join(path, files[i])))
  }

  return content
}

/**
 * Require every js file in a directory and return an object with the filenames as keys and the exports as values.
 * @param   {String} path The directory to read.
 * @returns {Object}      The resulting object.
 */
function requireDirToObject (path) {
  const content = {}
  const files = readdirSync(path)

  for (let i = 0; i < files.length; i++) {
    if (files[i] !== 'index.js') content[files[i].match(filenameRegex)[1]] = require(join(path, files[i]))
  }

  return content
}

const statusEmojis = {
  online: '<a:Online:469626088579006464>',
  streaming: '<a:Streaming:469626088151187458>',
  dnd: '<a:DND:469626088612429824>',
  idle: '<a:Away:469626088285274172>',
  offline: '<a:Offline:469626088662892554>'
}

/**
 * Compile Discord messages into content suitable for transmitting.
 * @async
 * @this    agent
 * @param   {Eris.Message}    msg The message to compile.
 * @returns {Promise<Object>}     An object containing the transmission data.
 */
async function compileMessage (msg) {
  const guildData = await this._knex.get({
    table: 'guilds',
    columns: ['channel', 'room', 'abbreviation'],
    where: {
      id: msg.channel.guild.id
    }
  })

  if (guildData && msg.channel.id === guildData.channel) {
    return this._knex.get({
      table: 'rooms',
      columns: 'owner',
      where: {
        name: guildData.room
      }
    }).then(({ owner }) => {
      const content = (msg.channel.guild.id === owner ? '👑 ' : '') +
      `*${guildData.abbreviation}* **${msg.author.username}#${msg.author.discriminator}**` +
      `${msg.content ? ' ' + msg.content : ''}${msg.attachments.length ? msg.attachments.reduce((a, attachment) => a + attachment.url, '\n') : ''}`

      if (content.length > 2000) {
        throw msg.channel.createMessage({
          embed: {
            title: 'Message is too long to pass through.',
            color: 16777010
          }
        })
      } else return { room: guildData.room, msg: content, exclude: msg.channel.guild.id }
    })
  }
  throw Error('No room.')
}

/**
 * Transmit a message across a room.
 * @this    agent
 * @param   {Object}                  data      The data for the transmission.
 * @prop    {String}                  data.room The room to transmit the message to.
 * @prop    {Object}                  data.msg  The message to transmit.
 * @returns {Promise<Eris.Message[]>}           An array of all messages sent.
 */
function transmit ({ room, msg, exclude = '' }) {
  return this._knex.select({
    table: 'guilds',
    columns: 'channel',
    where: {
      room
    },
    whereNot: {
      id: exclude
    }
  }).then((channels) => {
    if (channels.length) {
      const promises = []

      for (const { channel } of channels) promises.push(this._client.createMessage(channel, msg))

      return Promise.all(promises)
    }
  })
}

/**
 * Build a room management panel.
 * @async
 * @this                      agent
 * @param   {String}          room  The name of the room.
 * @param   {String}          guild The ID of the guild.
 * @returns {Promise<Object>}       The message data containing the panel.
 */
async function buildPanel (room, guild) {
  const {
    ownerButtons,
    memberButtons
  } = require('./roomButtons/')

  const roomData = await this._knex.get({
    table: 'rooms',
    where: {
      name: room
    }
  })
  const guildData = await this._knex.get({
    table: 'guilds',
    where: {
      id: guild
    }
  })

  const guildObject = this._client.guilds.get(guild)

  const isOwner = guild === roomData.owner
  const buttons = isOwner ? ownerButtons : memberButtons

  return {
    embed: {
      author: {
        name: 'Room Control Panel',
        icon_url: guildObject.iconURL
      },
      title: `**${roomData.name}**`,
      thumbnail: {
        url: this._client.guilds.get(roomData.owner).iconURL
      },
      color: isOwner ? 4980889 : undefined,
      fields: buttons.map((b) => {
        return {
          name: `${b.emoji} **${b.name}**`,
          value: b.value ? b.value({ client: this._client, guild: guildObject, guildData, roomData }) : '​',
          inline: true
        }
      }),
      footer: {
        text: `${isOwner ? '👑 ' : ''}You are ${isOwner ? 'the owner' : 'a member'} of the room`
      }
    },
    options: {
      reactInterface: new ReactInterface({
        buttons: buttons.map((b) => new ReactCommand(b)),
        options: {
          restricted: true,
          designatedUsers: guildData.adminrole ? guildObject.members.reduce((accum, { id, roles }) => {
            if (roles.find((r) => r === guildData.adminrole)) accum.push(id)
            return accum
          }, []).concat([guildObject.ownerID]) : guildObject.ownerID,
          removeReaction: true
        }
      })
    }
  }
}

/**
 * Abbreviate a name.
 * @param   {String} name The name to abbreviate.
 * @returns {String}      The abbreviated result.
 */
function abbreviate (name) {
  return name.split(' ').reduce((a, w) => a + w[0], '')
}

module.exports = {
  links,
  requireDirToArray,
  requireDirToObject,
  statusEmojis,
  compileMessage,
  transmit,
  buildPanel,
  abbreviate
}
