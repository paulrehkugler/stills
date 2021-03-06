const tumblr = require('tumblr.js');
const { readFileSync, createReadStream } = require('fs');
const { get } = require('lodash');
const { compressToSize } = require('./utils');

const MAX_GIF_BYTES = 3000000;

class DestinationTumblr {
  constructor({
    consumerKey,
    consumerSecret,
    token,
    tokenSecret,
    blogName,
    tags = [],
    reblog = {
      postId: null,
      blogName: null
    }
  }) {
    this.client = tumblr.createClient({
      token,
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
      token_secret: tokenSecret,
      returnPromises: true
    });
    this.blogName = blogName;
    this.reblog = reblog;
    this.tags = tags;
  }

  get name() {
    return 'tumblr';
  }

  getBaseParams(apiPath) {
    return {
      ...this.client.requestOptions,
      url: this.client.baseUrl + apiPath,
      oauth: this.client.credentials
    };
  }

  getStartUserIndexes(text, user) {
    const result = [];
    if (!user || !text) {
      return result;
    }
    const { name } = user;
    const regexp = new RegExp(name, 'gi');
    let m;
    while ((m = regexp.exec(text))) {
      result.push(m.index);
    }
    return result;
  }

  async makeNpfRequestForm(apiPath, formData, body) {
    return new Promise((resolve, reject) => {
      this.client.request.post(
        {
          ...this.getBaseParams(apiPath),
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          formData: {
            json: JSON.stringify(body),
            ...formData
          }
        },
        (err, _response, body) => {
          if (err) {
            return reject(err);
          }
          try {
            body = JSON.parse(body);
          } catch (e) {
            return reject(`Malformed Response: ${body}`);
          }
          resolve(body);
        }
      );
    });
  }

  async createPhotoPostNpf(images, tags, text, user) {
    const formData = images.reduce((memo, image, index) => {
      memo[`pic${index}`] = createReadStream(image);
      return memo;
    }, {});

    const imageContent = images.map((image, index) => {
      return {
        type: 'image',
        media: [
          {
            identifier: `pic${index}`
          }
        ]
      };
    });

    const textContent = text ? { type: 'text', text } : null;
    if (textContent && user) {
      const { name } = user;
      const indexes = this.getStartUserIndexes(text, user);
      if (indexes.length > 0) {
        const length = name.length;
        const formatting = indexes.map((start) => {
          const end = start + length;
          return {
            start,
            end,
            type: 'mention',
            blog: user
          };
        });
        textContent.formatting = formatting;
      }
    }

    const { response } = await this.makeNpfRequestForm(
      `/blog/${this.blogName}/posts`,
      formData,
      {
        tags: tags.join(','),
        content: [...imageContent, ...(textContent ? [textContent] : [])]
      }
    );
    return response;
  }

  async reblogPost(reblogPostId, reblogName, tags, text) {
    const postInfo = await this.client.blogPosts(reblogName, {
      id: reblogPostId
    });
    const reblogKey = get(postInfo, 'posts[0].reblog_key');

    const response = await this.client.reblogPost(this.blogName, {
      id: reblogPostId,
      tags: tags.join(','),
      reblog_key: reblogKey,
      comment: text
    });
    return response;
  }

  async publish(images, { text = null, tags = [] } = {}, globals) {
    const user = globals && globals.user ? globals.user : null;
    const postTags = [...tags, ...this.tags].map((tag) =>
      tag.replace(/,/g, '')
    );
    const { postId: reblogPostId, blogName: reblogName } = this.reblog;

    const response =
      reblogPostId && reblogName
        ? await this.reblogPost(reblogPostId, reblogName, postTags, text)
        : await this.createPhotoPostNpf(images, postTags, text, user);

    const url = `https://${this.blogName}.tumblr.com/post/${response.id}`;
    return {
      url,
      text,
      blogName: this.blogName,
      tags: postTags,
      postId: '' + response.id
    };
  }
}

module.exports = DestinationTumblr;
