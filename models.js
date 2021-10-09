"use strict"; // global scope - Strict mode changes previously accepted "bad syntax" into real errors.

const BASE_URL = "https://hack-or-snooze-v3.herokuapp.com";

/******************************************************************************
 * Story: a single story in the system
 */

class Story {

  /** Make instance of Story from data object about story:
   *   - {title, author, url, username, storyId, createdAt}
   */

  constructor({ storyId, title, author, url, username, createdAt }) { // constructor is called when making a new instance of Story
    this.storyId = storyId;
    this.title = title;
    this.author = author;
    this.url = url;
    this.username = username;
    this.createdAt = createdAt;
  }

  /** Parses hostname out of URL and returns it. */

  getHostName() {
    return new URL(this.url).host; // returns new object const url = new URL(url) + const host = url.host
  }
}


/******************************************************************************
 * List of Story instances: used by UI to show story lists in DOM.
 */

class StoryList {
  constructor(stories) { // constructor is called when making a new instance of StoryList
    this.stories = stories;
  }

  /** Generate a new StoryList. It:
   *
   *  - calls the API
   *  - builds an array of Story instances
   *  - makes a single StoryList instance out of that
   *  - returns the StoryList instance.
   */

  static async getStories() {
    // Note presence of `static` keyword: this indicates that getStories is
    //  **not** an instance method. Rather, it is a method that is called on the
    //  class directly. Why doesn't it make sense for getStories to be an
    //  instance method? -- There is a single StoryList instance

    // query the /stories endpoint (no auth required)
    const response = await axios({
      url: `${BASE_URL}/stories`,
      method: "GET",
    });

    // turn plain old story objects from API into instances of Story class
    const stories = response.data.stories.map(story => new Story(story));

    // build an instance of our own class using the new array of stories
    return new StoryList(stories);
  }

  /** Adds story data to API, makes a Story instance, adds it to story list.
   * - user - the current instance of User who will post the story
   * - obj of {title, author, url}
   *
   * Returns the new Story instance
   */
  async addStory(user, { title, author, url }) {
    const token = user.loginToken; // define token as only logged in/ auth users can add stories
    const response = await axios({
      method: "POST",
      url: `${BASE_URL}/stories`,
      data: { token, story: { title, author, url } },
    });

    const story = new Story(response.data.story); // instantiation of Story
    this.stories.push(story); // push the new story to all stories
    user.ownStories.push(story); // push the new story to user stories

    return story;
  }

  async removeStory(user, storyId) {
    const token = user.loginToken; // define token as only logged in/ auth users can remove stories
    await axios({
      url: `${BASE_URL}/stories/${storyId}`,
      method: "DELETE", // method from API
      data: { token: token }
    });

    // filter out the story whose ID we are removing from all stories
    this.stories = this.stories.filter(story => story.storyId !== storyId); // can i use something diff from filter?

    // do the same thing for the user's list of stories & their favorites
    user.ownStories = user.ownStories.filter(story => story.storyId !== storyId);
    user.favorites = user.favorites.filter(story => story.storyId !== storyId);
  }

}


/******************************************************************************
 * User: a user in the system (only used to represent the current user)
 */

class User {
  /** Make user instance from obj of user data and a token:
   *   - {username, name, createdAt, favorites[], ownStories[]}
   *   - token
   */

  constructor({
                username,
                name,
                createdAt,
                favorites = [],
                ownStories = []
              },
              token) {
    this.username = username;
    this.name = name;
    this.createdAt = createdAt;

    // instantiate Story instances for the user's favorites and ownStories
    this.favorites = favorites.map(story => new Story(story));
    this.ownStories = ownStories.map(story => new Story(story));

    // store the login token on the user so it's easy to find for API calls.
    this.loginToken = token;
  }

  /** Register new user in API, make User instance & return it.
   *
   * - username: a new username
   * - password: a new password
   * - name: the user's full name
   */

  static async signup(username, password, name) {
    const response = await axios({
      url: `${BASE_URL}/signup`,
      method: "POST",
      data: { user: { username, password, name } },
    });

    let { user } = response.data

    return new User(
      {
        username: user.username,
        name: user.name,
        createdAt: user.createdAt,
        favorites: user.favorites,
        ownStories: user.stories
      },
      response.data.token // get new token for new user
    );
  }

  /** Login in user with API, make User instance & return it.

   * - username: an existing user's username
   * - password: an existing user's password
   */

  static async login(username, password) { // method is called on User class directly
    const response = await axios({
      url: `${BASE_URL}/login`,
      method: "POST",
      data: { user: { username, password } },
    });

    let { user } = response.data;

    return new User(
      {
        username: user.username,
        name: user.name,
        createdAt: user.createdAt,
        favorites: user.favorites,
        ownStories: user.stories
      },
      response.data.token
    );
  }

  /** When we already have credentials (token & username) for a user,
   *   we can log them in automatically. This function does that.
   */

  static async loginViaStoredCredentials(token, username) {
    try {
      const response = await axios({
        url: `${BASE_URL}/users/${username}`,
        method: "GET",
        params: { token },
      });

      let { user } = response.data;

      return new User(
        {
          username: user.username,
          name: user.name,
          createdAt: user.createdAt,
          favorites: user.favorites,
          ownStories: user.stories
        },
        token
      );
    } catch (err) { // meaning we don't have necessary info already stored
      console.error("loginViaStoredCredentials failed", err);
      return null;
    }
  }

  /** Add a story to the list of user favorites and update the API
   * - story: a Story instance to add to favorites
   */

  async addFavorite(story) {
    this.favorites.push(story);
    await this.changeFavorite("add", story)
  }

   /** Remove a story to the list of user favorites and update the API
   * - story: the Story instance to remove from favorites
   */

  async removeFavorite(story) {
    this.favorites = this.favorites.filter((favorite) => { // filter out stories with storyId that match the story you're removing
      return favorite.storyId !== story.storyId;
    });

    await this.changeFavorite("remove", story);
  }

  /** Update API with favorite/not-favorite.
   *   - status: "add" or "remove"
   *   - story: Story instance to make favorite / not favorite
   * */

  async changeFavorite(status, story) {
    const method = status === "add" ? "POST" : "DELETE"; // if you'd like to add a favorite use post method, else use delete method
    const token = this.loginToken; // only allow logged in users to change favorite status
    await axios({
      url: `${BASE_URL}/users/${this.username}/favorites/${story.storyId}`,
      method: method,
      data: { token },
    });
  }

  /** Return true/false if given Story instance is a favorite of this user. */

  isFavorite(story) {
    return this.favorites.some(s => (s.storyId === story.storyId)); // check if at least one storyId equals those in favorites
  }

}
