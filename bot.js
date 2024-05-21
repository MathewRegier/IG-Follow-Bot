const { IgApiClient, IgLoginTwoFactorRequiredError, IgCheckpointError } = require('instagram-private-api');
const { readFileSync, writeFileSync, existsSync } = require('fs');

const ig = new IgApiClient();

async function login() {
    ig.state.generateDevice('evixieagency');
    ig.request.end$.subscribe(async () => {
        const serialized = await ig.state.serialize();
        delete serialized.constants; // Remove constant fields
        writeFileSync('./session.json', JSON.stringify(serialized));
    });

    if (existsSync('./session.json')) {
        const session = JSON.parse(readFileSync('./session.json', 'utf-8'));
        await ig.state.deserialize(session);
        console.log('Session restored');
    } else {
        await ig.simulate.preLoginFlow();
        const loggedInUser = await ig.account.login('evixieagency', '99-Huntersquare-99');
        process.nextTick(async () => await ig.simulate.postLoginFlow());
        console.log('Logged in as:', loggedInUser.username);
    }
}

async function getFollowing() {
    const followingFeed = ig.feed.accountFollowing(ig.state.cookieUserId);
    const followingItems = [];
    let following;
    do {
        following = await followingFeed.items();
        followingItems.push(...following);
    } while (following.length > 0);
    return followingItems.map(user => user.pk);
}

async function followUsersFromHashtag(hashtag, retryDelay = 10000, retryCount = 0) {
    try {
        await login();

        const followingList = await getFollowing();
        const hashtagFeed = ig.feed.tags(hashtag);
        console.log(`Fetching posts for hashtag: ${hashtag}`);
        
        const userIdsToFollow = [];
        let posts = [];
        
        do {
            posts = await hashtagFeed.items();
            console.log(`Fetched ${posts.length} posts`);
            
            for (const post of posts) {
                if (post && post.user && !followingList.includes(post.user.pk)) {
                    console.log(`Following user: ${post.user.username} (ID: ${post.user.pk})`);
                    userIdsToFollow.push(post.user.pk);
                    await ig.friendship.create(post.user.pk);
                    await new Promise(resolve => setTimeout(resolve, 15000)); // 15 seconds delay
                } else {
                    console.error('User property is undefined for a post or user already followed:', JSON.stringify(post, null, 2));
                }
            }
        } while (hashtagFeed.isMoreAvailable());

    } catch (error) {
        if (error.response) {
            console.error('Response error:', error.response.body);
            if (error.response.body.message === 'Please wait a few minutes before you try again.') {
                if (retryCount >= 5) {
                    console.error('Reached max retry attempts. Exiting...');
                    return;
                }
                retryDelay *= 2; // Exponential backoff
                retryCount += 1;
                console.log(`Retrying in ${retryDelay / 1000} seconds (Attempt ${retryCount})...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                await followUsersFromHashtag(hashtag, retryDelay, retryCount); // Retry the function
            }
        } else if (error instanceof IgLoginTwoFactorRequiredError) {
            console.error('Two-factor authentication required.');
        } else if (error instanceof IgCheckpointError) {
            console.error('Checkpoint required.');
        } else {
            console.error('An error occurred:', error.message);
        }
    }
}

// Replace 'your_hashtag' with the actual hashtag you want to use, without the '#'
followUsersFromHashtag('windsorontariobusiness');
