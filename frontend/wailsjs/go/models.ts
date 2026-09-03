export namespace main {
	
	export class UserProfile {
	    id: string;
	    email: string;
	    name: string;
	    picture: string;
	
	    static createFrom(source: any = {}) {
	        return new UserProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.email = source["email"];
	        this.name = source["name"];
	        this.picture = source["picture"];
	    }
	}

}

