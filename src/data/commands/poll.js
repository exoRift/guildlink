const {
  Command,
  ReactCommand,
  ReactInterface
} = require('cyclone-engine')

function buildField (choiceCounts, choiceName, index) {
  return {
    name: `${String(index + 1)}⃣  ${choiceName}`,
    value: `*${choiceCounts[index]}*`,
    inline: true
  }
}

const data = {
  name: 'poll',
  desc: 'Initiate a room-wide poll that lasts 10 minutes (Choices separated by spaces)',
  options: {
    args: [{ name: 'name', mand: true, delim: '|' }, { name: 'choices', mand: true, delim: '|' }, { name: 'timeout (minutes)' }],
    guildOnly: true,
    authLevel: 1,
    guide: {
      color: 0x7777FF,
      fields: [{
        name: 'Polling across multiple servers',
        value: 'Provide the name of the poll and the choices\nThe name is separated from the choices with a bar (`|`)\nChoices are separated by spaces\nPolls last for an hour by default or until they\'re manually closed\nThe timeout argument is in minutes'
      }]
    }
  },
  action: async ({ agent, msg, args: [name, choices, timeout = 60] }) => {
    const currentGuildSubquery = agent.attachments.db('guilds')
      .select('room')
      .where('id', msg.channel.guild.id)

    const guilds = await agent.attachments.db('guilds')
      .select(['id', 'channel', 'room'])
      .where('room', 'in', currentGuildSubquery)

    if (guilds.length) {
      const guildData = guilds.find((g) => g.id === msg.channel.guild.id)

      choices = choices.split(' ').slice(0, 9)

      const poll = {
        votes: [],
        choices: new Array(choices.length).fill(0)
      }

      const menu = {
        embed: {
          author: {
            name: 'Vote',
            icon_url: msg.channel.guild.iconURL
          },
          title: `**${name}**`,
          description: `Poll from: __${msg.channel.guild.name}__`,
          color: 0xFFFF00,
          fields: choices.map(buildField.bind(this, poll.choices)),
          footer: {
            text: `Initiated by: ${msg.author.username}`
          }
        }
      }

      const responses = await agent.attachments.transmit(agent.client, agent.attachments.db, { room: guildData.room, msg: menu })

      const refresh = setInterval(() => {
        for (const response of responses) {
          menu.embed.fields = choices.map(buildField.bind(this, poll.choices))

          response.edit(menu)
        }
      }, 8000)

      const autoClose = setTimeout(() => closePoll(), timeout * 60000)

      const closePoll = () => {
        clearInterval(refresh)
        clearTimeout(autoClose)

        for (const response of responses) {
          menu.embed.color = 16711680

          response.edit(menu)

          agent.reactionHandler.detachInterface(response, false)
        }

        agent.attachments.transmit(agent.client, agent.attachments.db, {
          room: guildData.room,
          msg: {
            embed: {
              author: {
                name: 'Poll',
                icon_url: msg.channel.guild.iconURL
              },
              title: '**The results are in!**',
              description: `**${name}**`,
              color: 0xFFFF,
              fields: choices.map(buildField.bind(this, poll.choices)),
              footer: {
                text: `Initiated by: ${msg.author.username}`
              }
            }
          }
        })
      }

      for (const response of responses) {
        const buttons = choices.map((c, i) => new ReactCommand({
          emoji: String(i + 1) + '⃣',
          action: ({ emoji, user }) => {
            if (!poll.votes.includes(user.id)) {
              poll.choices[parseInt(emoji.name.slice(0, 1)) - 1]++

              poll.votes.push(user.id)
            }
          }
        }))

        if (response.channel.guild.id === msg.channel.guild.id) {
          buttons.push(new ReactCommand({
            emoji: '❌',
            action: ({ user }) => {
              if (agent.getTopPermissionLevel(msg.channel.guild.members.get(user.id)) > 0) closePoll()
            }
          }))
        }

        agent.reactionHandler.bindInterface(response, new ReactInterface({
          buttons
        }))
      }

      return 'Poll created!'
    } else return '`You are not currently in a room`'
  }
}

module.exports = new Command(data)
