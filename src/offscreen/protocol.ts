/** Fields extracted from a CodeChef profile page by the offscreen parser. */
export interface CodechefFields {
  rating?: number;
  highestRating?: number;
  stars?: number;
  solved?: number;
  globalRank?: number;
  /** False when the page lacked the profile markup entirely. */
  isProfilePage: boolean;
}

export interface ParseRequest {
  type: 'parse-codechef';
  html: string;
}

export interface ParseResponse {
  type: 'parse-result';
  fields?: CodechefFields;
  error?: string;
}
